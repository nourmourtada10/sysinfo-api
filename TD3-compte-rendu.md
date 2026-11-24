# TD3 — Intégration et livraison continues de sysinfo-api

Vérifications réalisées le 24 novembre 2026 sous Ubuntu WSL2 et sur GitHub Actions. Les six tests Jest passent dans les deux environnements et l’image multi-étapes démarre correctement dans WSL2.

## À quoi sert l’intégration continue ?

Le workflow `CI` s’exécute à chaque push sur `main`. Sur `ubuntu-latest`, il installe Node.js **22.23.5**, installe les dépendances verrouillées avec `npm ci`, compile le TypeScript avec `npm run build` et exécute Jest avec `npm run test`. La compilation et les tests permettent de détecter les régressions avant la livraison.

Sous Ubuntu WSL2, les trois commandes se sont terminées avec succès. Jest a exécuté **6 tests répartis dans 2 suites**. Le cas signalé `/api/v1/sysinfo1/sysinfo` renvoyait déjà `404`, car le serveur compare l’URL à la route exacte. Un test de régression vérifie désormais cette réponse. La route `/api/v1/sysinfo` renvoie `200`.

## Comment la livraison continue est-elle déclenchée ?

Le workflow `CD` écoute l’événement `workflow_run` de type `completed` pour `CI` sur `main`. Le job de publication exige une conclusion `success` et un événement `push` provenant du même dépôt. Il récupère le commit testé via `github.event.workflow_run.head_sha`, ce qui garantit que le contexte de construction est celui validé par CI, y compris si la branche a avancé entre-temps. [Événement workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)

Sur le commit `afe55ca`, le fichier `.github/workflows/cd.yml` était présent sur `main` et son contenu correspondait à la copie locale validée par `actionlint`. L’API GitHub Actions indiquait toutefois l’état `deleted` pour son entrée. La tentative de réactivation avec `gh workflow enable` a renvoyé HTTP 403. Après le push de `b35e935`, l’entrée est redevenue `active`. Ce commit ajoute un contrôle qui compare `git rev-parse HEAD` au SHA transmis par CI avant la construction.

## Comment l’image est-elle construite et versionnée ?

Docker Buildx utilise le Dockerfile multi-étapes du TD2. L’étape `builder` compile l’application. L’étape `runner` contient Node.js, les dépendances de production et les fichiers JavaScript compilés. Le processus s’exécute sous l’utilisateur `node`.

Une seule construction produit une image associée à quatre références. Le tag `latest` est un repère mobile, tandis que le tag contenant le SHA complet rattache l’image à la révision testée. Le digest du manifeste identifie le contenu publié. Le workflow compare le digest de chacune des quatre références à celui retourné par Buildx.

| Registre                               | Tags                                    |
| -------------------------------------- | --------------------------------------- |
| `docker.io/nourmourtada10/sysinfo-api` | `latest` et SHA complet du commit testé |
| `ghcr.io/nourmourtada10/sysinfo-api`   | `latest` et SHA complet du commit testé |

## Comment les deux registres sont-ils authentifiés ?

Docker Hub utilise les secrets de dépôt `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN`. Le jeton Docker Hub doit avoir les droits de lecture et d’écriture. GHCR utilise le `GITHUB_TOKEN` automatique du job avec `packages: write`. L’accès `contents: read` permet de récupérer le code source. Seuls les noms des secrets de dépôt ont été consultés lors de la vérification. [Publication d’images Docker avec GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)

## Résultats et suivi

| Vérification                                     | Résultat observé                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Installation et compilation sous Node.js 22.23.5 | `npm ci` et `npm run build` réussis                                                |
| Tests locaux                                     | 2 suites et 6 tests réussis                                                        |
| Validation statique de CI et CD                  | `actionlint` 1.7.12 réussi                                                         |
| Construction locale de l’image multi-étapes      | `sysinfo-api:td3-local`, 90 960 169 octets, utilisateur `node`                     |
| Essai HTTP dans le conteneur                     | `/` → 404, `/api/v1/sysinfo1/sysinfo` → 404, `/api/v1/sysinfo` → 200               |
| CI sur GitHub Actions                            | Installation, compilation et 6 tests réussis sur le commit `b35e935`               |
| Secrets GitHub Actions                           | `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` présents                                 |
| CD et publication                                | Exécution automatique réussie après CI, avec contrôle du commit et des quatre tags |

Les commandes `gh run list` et `gh run watch <id> --exit-status` ont confirmé la réussite de CI, puis celle de CD déclenchée par `workflow_run`. [Exécution CI nº 45420949693](https://github.com/nourmourtada10/sysinfo-api/actions/runs/45420949693) · [Exécution CD nº 45421051619](https://github.com/nourmourtada10/sysinfo-api/actions/runs/45421051619)

Pour cette exécution, le SHA publié était `b35e935f9485cb9e5024c011f56f676930cc15c4`. Immédiatement après la publication, une vérification indépendante avec `docker buildx imagetools inspect` a retrouvé le même digest pour les deux tags (`latest` et le SHA complet) sur les deux registres.

```text
sha256:924e15c9cb9ca570d6072ebc54e1a6da53160298881071ee74a86d34caa5e727
```
