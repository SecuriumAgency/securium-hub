# Registre des agents de l'écosystème

Inventaire établi le 30 octobre 2026 par lecture des dépôts du workspace (`C:\Securium-Workspace`) : configurations PM2, scripts, workflows GitHub Actions, routes et journaux. Aucun secret n'est reproduit ici.

Ce registre est lu par le cockpit `/admin/agents` (`lib/agents/registry.ts`). Il faut le tenir à jour à la main quand un agent est ajouté ou retiré.

## 1. Agents du poste (Securium-OS, PM2)

Ils tournent sur la machine locale. Le Hub ne les pilote pas : il reçoit leur état par le rapport de télémétrie (`POST /api/telemetry`).

| Nom PM2 | Source | Rôle | Déclenchement |
|---|---|---|---|
| `securium-orchestrator` | `Securium-OS/scripts/sec-orchestrator.sh` | Lit Discord, puis lance la flotte d'agents | Cron `0 20 * * *` |
| `securium-sync-remote` | `Securium-OS/scripts/sync-remote.mts` | DevOps : push groupé des dépôts du parc | 23h30, ou dès 20 commits d'avance |
| `securium-fleet-watch` | `agent-dashboard/scripts/fleet-watch.mjs` | Vérifie les builds de la flotte, pousse la télémétrie | En continu, scan toutes les 60 s |
| `securium-ai-workers` | `agent-dashboard/scripts/autonomous-workers.mts` | Boucle d'agents IA, facturée à l'API Anthropic | En continu, redémarrage espacé d'une minute |
| `securium-dashboard` | `agent-dashboard` (`next start`) | Tableau de bord local | En continu, sur 127.0.0.1 |

Agents lancés par l'orchestrateur (`scripts/start-all-agents.sh`), chacun avec une pause de 10 s :

| Agent | Script | Rôle | Sortie |
|---|---|---|---|
| Market Simulator | `simulate-market.sh` | Simulation de marché | Rapport PDF |
| CFO | `run-cfo.sh` | Analyse financière | Rapport PDF |
| DevOps | `run-devops.sh` | Rapport de santé croisé du parc (`npm audit`, `npm outdated`, lint, typecheck) | Rapport PDF ; correction Dependabot seulement si `SECURIUM_AUTOFIX=1` |
| Lead Prospector | `run-prospector.sh` | Stratégie d'acquisition B2B | Texte dans le journal d'activité |
| SEO Architect | `run-seo.sh` | Recommandation Core Web Vitals, et contenu si Discord signale des impressions sans clics | Texte dans le journal d'activité |

Scripts de maintenance, sans agent permanent : `evening-review.sh`, `morning-dashboard.sh`, `generate-pdfs.sh`, `autofix-dependabot.sh`, `omniroute-fallback.sh`, `setup-repo-optimization.sh`, `verify.js`, `improve-system.py`, `discord-reader.js` (lecture Discord, appelée par l'orchestrateur).

## 2. Agents du Hub (securium-hub/scripts)

Exécutés à la main ou par planification, depuis le poste. Ils écrivent dans la base du Hub.

| Script | Rôle |
|---|---|
| `agent-chasseur.mts` | Chasseur : rédige un brouillon d'email par prospect, en attente de validation |
| `agent-chasseur-segments.mts` | Chasseur : accroche modèle par segment du CSV des prospects |
| `agent-icebreakers.mts` | Rédige une accroche de premier contact, limitée aux horaires d'envoi (lundi–vendredi, 9 h–18 h) |
| `agent-inbound.mts` | Lit les réponses IMAP et les enregistre comme messages entrants |
| `fleet-daily-report.mts` | Rapport quotidien de la flotte (rôle déduit du nom, à confirmer) |
| `migrate-outreach.mts` | Import du registre du prospecteur vers le Hub |

## 3. Workflows GitHub Actions

| Dépôt | Workflow | Déclencheur | Rôle | Runner |
|---|---|---|---|---|
| geoenergyhabitat | `ci-validation.yml` | Pull request | Build, puis fusion automatique (`gh pr merge --auto --squash`) | self-hosted |
| geoenergyhabitat | `lighthouse.yml` | `workflow_dispatch` | Lighthouse CI | self-hosted |
| geoenergyhabitat | `seo-indexing.yml` | `workflow_dispatch` | Indexation Google (`indexation:auto`), fenêtre de fraîcheur paramétrable | self-hosted |
| Elite-Depannage | `ci.yml` | `workflow_dispatch` | CI | ubuntu-latest |
| Elite-Depannage | `lighthouse-ci.yml` | `workflow_dispatch` | Lighthouse CI | ubuntu-latest |

Les workflows `lighthouse`, `seo-indexing`, `lighthouse-ci` peuvent être déclenchés depuis le cockpit (`lib/agents/triggers.ts`), avec `GITHUB_ACTIONS_TOKEN` défini.

## 4. Agents IA autonomes

| Agent | Source | Rôle | Points d'attention |
|---|---|---|---|
| Autonomous workers | `agent-dashboard/scripts/autonomous-workers.mts` | Produit des livrables et les commit dans les dépôts | Commit automatique ; texte Discord en entrée (injection possible) |
| Outil d'écriture | `agent-dashboard/src/lib/ai/anthropic-engine.ts` | Écriture de fichiers depuis un appel d'outil du modèle | Chemins contrôlés, mais à relire |

## 5. Non trouvé dans le workspace

- **Securium CI Monitor** : aucun fichier, script, workflow ou mention de ce nom. Aucune trace n'est restée dans les dépôts ni dans les journaux.
- **Syndication Dev.to / Discord** : aucun workflow de publication n'existe. Les seules mentions de Dev.to sont dans des fichiers `tsconfig.tsbuildinfo` et `package-lock.json`, sans rapport.

Si ces deux agents existent ailleurs (autre compte GitHub, autre poste), les ajouter ici avec leur source.

## 6. Points d'attention

- Deux copies possibles des dépôts : `C:\Securium-Workspace\…` et `C:\Users\Utilisateur\Documents\Securium\…`. Les agents shell visent la seconde. Voir `AGENT_DASHBOARD_AUDIT.md`, constat 6.
- Le tableau de bord local n'a pas d'authentification. Voir `AGENT_DASHBOARD_AUDIT.md`, constats 1 et 2.
- Les agents IA et les agents du Hub sont liés au poste : si le poste est éteint, la flotte cesse de rapporter.
