# TD2 — Conteneurisation de l’API sysinfo

Essais réalisés le 24 novembre 2026 sous Ubuntu 24.04 dans WSL2, sur `linux/amd64`. Les quatre conteneurs testés répondent `404` sur `/` et `200` sur `/api/v1/sysinfo`. L’image multi-étapes occupe 65,44 % de moins selon la taille locale mesurée par Docker.

## 1. Vérification de Docker Engine

`docker version` a renvoyé la version **29.10.0** pour le client et le serveur. `docker info` a indiqué **cgroup v2**, le pilote de cgroups `systemd` et le pilote de stockage `overlayfs`. Le compte WSL courant a reçu un refus d’accès au socket Docker. Les commandes Docker ont été exécutées sous le compte `root` de WSL. Les processus Node.js dans les deux images s’exécutent en tant que `node` (UID 100).

## 2. Construction de l’image mono-étape

`Dockerfile.single` conserve le Dockerfile initial. Il utilise `alpine:3.20` et installe Node.js et npm avec `apk add --no-cache`. Il copie les manifestes npm avant le code source, ce qui permet de réutiliser la couche `npm ci` si le code change et que les manifestes restent identiques. `npm run build` compile le TypeScript dans `dist/`. `USER node` retire les privilèges de superutilisateur au processus applicatif. `EXPOSE 8000` documente le port utilisé par l’application et `docker run -p` le publie.

`.dockerignore` limite le contexte aux manifestes npm, à `tsconfig.json` et à `src/`. Le dépôt Git, les dépendances locales, le répertoire `dist/` de l’hôte et les fichiers de couverture restent hors du contexte.

Commande de reconstruction après l’archivage du Dockerfile initial.

```bash
docker build -f Dockerfile.single -t sysinfo-api:0.0.1 .
```

## 3. Tests HTTP et limites de ressources

Chaque image a été lancée avec les deux profils ci-dessous. Le port hôte a été attribué automatiquement sur `127.0.0.1`. La valeur de `--memory-swap` a été fixée à celle de `--memory`, ce qui s’est traduit par `memory.swap.max=0` dans les quatre conteneurs. [Contraintes de ressources Docker](https://docs.docker.com/engine/containers/resource_constraints/)

| Image | Limites RAM et CPU | `memory.max` (octets) | `cpu.max` (quota et période en µs) | RAM selon `docker stats` | CPU selon `docker stats` | HTTP `/` · API |
| --- | --- | ---: | --- | --- | ---: | --- |
| `0.0.1` | 128 Mio · 0,5 CPU | 134 217 728 | `50000 100000` | 15,03 Mio / 128 Mio | 0,00 % | 404 · 200 |
| `0.0.1` | 256 Mio · 1 CPU | 268 435 456 | `100000 100000` | 14,83 Mio / 256 Mio | 0,03 % | 404 · 200 |
| `0.0.2` | 128 Mio · 0,5 CPU | 134 217 728 | `50000 100000` | 14,82 Mio / 128 Mio | 0,00 % | 404 · 200 |
| `0.0.2` | 256 Mio · 1 CPU | 268 435 456 | `100000 100000` | 15,34 Mio / 256 Mio | 0,00 % | 404 · 200 |

Les quatre réponses de l’API avaient le type `application/json` et contenaient les huit champs attendus. Dans les quatre essais, `mem.total` valait **8 151 474 176 octets** et `cpu.cores` valait **20**. Ces valeurs correspondent au `MemTotal` de `/proc/meminfo` et au nombre de processeurs logiques en ligne mesurés dans WSL. `mem.used` et `currentLoad.currentLoad` sont des mesures variables dans cette vue du système. Pour connaître le plafond du conteneur, on lit sa configuration avec `docker inspect` ou les fichiers `memory.max` et `cpu.max`. Les mesures de `docker stats` ont été prises après l’appel HTTP et représentent l’activité à cet instant. [Métriques Docker](https://docs.docker.com/engine/containers/runmetrics/)

Exemple reproductible pour le premier profil. On change l’étiquette de l’image et on remplace `128m` par `256m` et `0.5` par `1` pour le second profil.

```bash
cid=$(docker run -d --memory 128m --memory-swap 128m --cpus 0.5 \
  -p 127.0.0.1::8000 sysinfo-api:0.0.1)
base="http://$(docker port "$cid" 8000/tcp)"
curl -sS --retry 5 --retry-connrefused -o /dev/null -w '%{http_code}\n' "$base/"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$base/api/v1/sysinfo"
curl -fsS "$base/api/v1/sysinfo" | python3 -c 'import json, sys; d=json.load(sys.stdin); print(d["mem"]["total"], d["cpu"]["cores"])'
docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' "$cid"
docker exec "$cid" cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/cpu.max
docker stats --no-stream "$cid"
docker rm -f "$cid"
```

## 4. Analyse des couches avec Docker et Dive

`docker image history --no-trunc --human=false` relie les instructions aux tailles affichées pour les couches. Dans `0.0.1`, les plus volumineuses sont `npm ci` (124 772 352 octets) et l’installation Alpine de Node.js et npm (71 512 064 octets). Dans `0.0.2`, la couche Node.js représente 56 705 024 octets, la copie de `node_modules` 1 028 096 octets et celle des fichiers JavaScript 24 576 octets. Les instructions `USER`, `EXPOSE` et `CMD` modifient la configuration de l’image et apparaissent avec une taille de zéro dans l’historique. [Documentation de `docker image history`](https://docs.docker.com/reference/cli/docker/image/history/)

Dive **v0.12.0** a analysé les deux images en mode CI. La lecture directe de l’export Docker 29 a échoué sur une couche. Une copie de chaque export a été convertie en archive compatible avec Dive, avec des couches TAR décompressées. Chaque couche décompressée a été vérifiée contre son identifiant SHA-256 (`diff_id`) d’origine. Les mesures Dive portent sur le contenu des couches analysées et les tailles Docker sur le stockage local de l’image. [Version 0.12.0 de Dive](https://github.com/wagoodman/dive/releases/tag/v0.12.0)

| Image | Couches du système de fichiers | Taille calculée par Dive (octets) | Octets redondants selon Dive |
| --- | ---: | ---: | ---: |
| `0.0.1` | 8 | 162 894 845 | 582 119 |
| `0.0.2` | 5 | 64 523 855 | 468 329 |

## 5. Image multi-étapes et comparaison des tailles

Les étapes `builder` et `runner` partent toutes deux de `alpine:3.20`. Dans `builder`, npm installe les dépendances de développement nécessaires à la compilation, puis `npm prune --omit=dev` les retire de l’arbre de dépendances copié. Dans `runner`, les seuls fichiers applicatifs sont `dist/index.js`, `dist/server.js`, `dist/sysinfo.js` et l’arbre des dépendances de production. Une vérification dans l’image finale a retrouvé `systeminformation` comme seul paquet npm installé pour l’application. Elle a confirmé l’absence de npm, de TypeScript, de Jest et de `src/`. La commande de démarrage exécute Node.js directement sous l’utilisateur `node`. [Constructions multi-étapes Docker](https://docs.docker.com/build/building/multi-stage/)

```bash
docker build -t sysinfo-api:0.0.2 .
docker image ls sysinfo-api
docker image inspect -f '{{.Size}}' sysinfo-api:0.0.1 sysinfo-api:0.0.2
```

| Image | `docker image inspect .Size` (octets) | `DISK USAGE` | `CONTENT SIZE` |
| --- | ---: | ---: | ---: |
| `0.0.1` | 263 194 654 | 263 MB | 57,9 MB |
| `0.0.2` | 90 960 169 | 91 MB | 24,7 MB |

Le gain de taille locale est de **172 234 485 octets (65,44 %)**. L’optimisation vient principalement du retrait des dépendances de développement, de npm et de son cache, ainsi que des fichiers nécessaires uniquement à la compilation.

## 6. Cgroups et commandes Linux

Un cgroup est un groupe hiérarchique de processus auquel le noyau Linux peut appliquer des règles de comptabilité et de répartition des ressources. Sous cgroup v2, les contrôleurs partagent une hiérarchie. Le contrôleur mémoire utilise `memory.max` pour imposer un plafond. Le contrôleur CPU utilise `cpu.max` pour spécifier un quota de temps CPU et une période. Ainsi, `50000 100000` accorde au groupe jusqu’à 50 ms de temps CPU par période de 100 ms, soit l’équivalent de 0,5 CPU sans fixer un cœur précis. [Documentation du noyau sur cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

- `cgcreate -g cpu,memory:td2-demo` crée le groupe `td2-demo` pour les contrôleurs indiqués. [Manuel de cgcreate](https://github.com/libcgroup/libcgroup/blob/main/doc/man/cgcreate.1)
- `cgset -r memory.max=134217728 td2-demo` fixe le plafond mémoire à 128 Mio sous cgroup v2. `cgset -r 'cpu.max=50000 100000' td2-demo` fixe le quota CPU. [Manuel de cgset](https://github.com/libcgroup/libcgroup/blob/main/doc/man/cgset.1)
- `cgexec -g cpu,memory:td2-demo node dist/index.js` lance l’application dans le groupe, où elle est soumise à ses limites. [Manuel de cgexec](https://github.com/libcgroup/libcgroup/blob/main/doc/man/cgexec.1)

Ces exemples supposent que les outils libcgroup sont installés, que les contrôleurs sont activés et que le sous-arbre est accessible en écriture. Dans les essais, Docker a configuré les limites via `--memory` et `--cpus`.

## 7. Rôle de chroot

`chroot /chemin/vers/rootfs /bin/sh` fait du répertoire `rootfs` la racine `/` utilisée pour résoudre les chemins de la commande et de ses descendants. Le répertoire doit contenir `/bin/sh` et ses bibliothèques si elles sont nécessaires. L’appel système requiert la capacité `CAP_SYS_CHROOT`. Le changement de racine porte sur la résolution des chemins. L’isolation des processus et du réseau relève des espaces de noms, et les plafonds de ressources relèvent des cgroups. [Manuel de chroot(2)](https://man7.org/linux/man-pages/man2/chroot.2.html)

## 8. Publication sur Docker Hub

Les deux étiquettes ont été construites et vérifiées localement. La publication est en attente de l’authentification et de la confirmation du nom d’utilisateur Docker Hub.
