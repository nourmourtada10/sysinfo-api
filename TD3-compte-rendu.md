# TD3 — Intégration et livraison continues de sysinfo-api

Vérifications locales et état de GitHub relevés le 24 novembre 2026. Les six tests Jest passent et l’image multi-étapes démarre correctement dans WSL2. Les résultats de publication seront ajoutés après l’exécution de la chaîne sur GitHub Actions.

## À quoi sert l’intégration continue ?

Le workflow `CI` s’exécute à chaque push sur `main`. Sur `ubuntu-latest`, il installe Node.js **22.23.5**, installe les dépendances verrouillées avec `npm ci`, compile le TypeScript avec `npm run build` et exécute Jest avec `npm run test`. La compilation et les tests permettent de détecter les régressions avant la livraison.

Sous Ubuntu WSL2, les trois commandes se sont terminées avec succès. Jest a exécuté **6 tests répartis dans 2 suites**. Le cas signalé `/api/v1/sysinfo1/sysinfo` renvoyait déjà `404`, car le serveur compare l’URL à la route exacte. Un test de régression vérifie désormais cette réponse. La route `/api/v1/sysinfo` renvoie `200`.

## Comment la livraison continue est-elle déclenchée ?

Le workflow `CD` écoute l’événement `workflow_run` de type `completed` pour `CI` sur `main`. Le job de publication exige une conclusion `success` et un événement `push` provenant du même dépôt. Il récupère le commit testé via `github.event.workflow_run.head_sha`, ce qui garantit que le contexte de construction est celui validé par CI, y compris si la branche a avancé entre-temps. [Événement workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)

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

| Vérification                                     | Résultat observé                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Installation et compilation sous Node.js 22.23.5 | `npm ci` et `npm run build` réussis                                           |
| Tests locaux                                     | 2 suites et 6 tests réussis                                                   |
| Validation statique de CI et CD                  | `actionlint` 1.7.12 réussi                                                    |
| Construction locale de l’image multi-étapes      | `sysinfo-api:td3-local`, 90 960 169 octets, utilisateur `node`                |
| Essai HTTP dans le conteneur                     | `/` → 404, `/api/v1/sysinfo1/sysinfo` → 404, `/api/v1/sysinfo` → 200          |
| CI sur GitHub Actions                            | Aucun workflow CI ni aucune exécution sur `main` au moment de la vérification |
| Secrets GitHub Actions                           | `DOCKERHUB_USERNAME` présent, `DOCKERHUB_TOKEN` absent                        |
| CD et publication                                | Vérification en attente du push approuvé et de l’ajout du secret Docker Hub   |

Après le push, `gh run list --branch main` permet d’identifier les exécutions. `gh run watch <id> --exit-status` suit chaque exécution et rapporte son état final. Les quatre références sont ensuite contrôlées avec `docker buildx imagetools inspect`. Les liens vers les exécutions et les digests seront consignés après vérification.
