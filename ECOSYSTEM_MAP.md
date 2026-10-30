# Écosystème Securium — carte à la date du 30 octobre 2026

Audit local de l'espace de travail `C:\Securium-Workspace` et des dépôts GitHub `SecuriumAgency`, plus un contrôle en lecture seule des URL publiques. Aucun identifiant n'est consigné ici.

## Tableau récapitulatif

| # | Module | Dépôt local | Dépôt distant · dernier commit | Adresse | État | Constats |
|---|---|---|---|---|---|---|
| 1 | **Securium Agency** (vitrine) | Absent de l'espace de travail | Non vérifié | https://www.securium-agency.fr | En ligne, HTTP 200 | Anomalie : `/admin/outreach` répond 200 avec une page 404 et le titre « Prospection · Administration Securium ». `/admin` répond 404 propre. Aucune donnée prospect visible (une seule adresse, `contact@`). |
| 2 | **Securium Hub** (dashboard, administration) | `securium-hub` | `SecuriumAgency/securium-hub` · `master` · `c9637c5` (30/10) | https://hub.securium-agency.fr | En ligne, déploiement de `c9637c5` lancé | 4 pages (`/`, `/login`, `/admin/outreach`, page 404) et 11 routes API. Admin protégée par session (middleware). Base Neon Postgres. Kanban, import CSV, icebreakers et garde-fou d'envoi poussés sur `master`. |
| 3 | **Securium Prospector / Outreach** | `securium-prospector` dans `Documents\CV` (hors espace de travail) | `SecuriumAgency/securium-prospector` · `97a6757` (26/10) | Hub : `/admin/outreach` | Actif | Côté prospector : registre et blocklist. Côté Hub : import JSON du registre, import CSV, brouillons du Chasseur, icebreakers, envoi SMTP sur validation humaine. |
| 4 | **Securium Labs** (R&D, dépôts, CI monitor) | **Aucun** | **Aucun trouvé** | **Inconnue** | Non renseigné | Mentionné seulement dans des journaux. À renseigner : dépôt ou URL. |
| 5 | **Securium OS / Workspace** (parc, télémétrie, Fleet API) | `Securium-OS` (docs, agents, journaux) ; `agent-dashboard` | `SecuriumAgency/Securium-OS` · `master` · `c24a2bc` (30/10) ; `SecuriumAgency/agent-dashboard` · `feat/ui-pdf-downloads` · `b01e276` (17/10) | Fleet dans le Hub : `/`, `/api/fleet`, `/api/telemetry` | Actif | `Securium-OS` n'a pas de `package.json` : c'est un dépôt de documentation et de journaux. `agent-dashboard` est une application Next.js. |

Sites clients, hors écosystème Securium Agency : `Elite-Depannage` (`master`, `2cd2cd3`) et `geoenergyhabitat` (`main`, `e1f6a18`, 28 pages, `/api/contact`, `/api/lead`). `geoenergyhabitat` affiche un badge « Securium » vers la vitrine : ce n'est pas la vitrine.

## Charte graphique relevée sur la vitrine

Source : les feuilles de style et le logo publics de https://www.securium-agency.fr.

- **Fond** `#0a0a0c`, cartes `#101828` (slate-900), surfaces `#111113`.
- **Accent** ambre `#f59e0b` (texte `#fbbf24`) ; succès vert `#22c55e` ; texte `#e5e7eb` et `#99a1af`.
- **Polices** : Syne (titres), Inter (texte), Space Grotesk (secondaire), monospace.
- **Logo** : `/logo/securium-logo.png`, PNG 500 × 500. Aucun SVG officiel trouvé. Favicon : `/logo/securium-favicon.png`.

Appliquée à l'administration du Hub : palette des jetons, polices, logo de la barre de navigation.

## Réconciliation `www` et `hub`

Constat : la page `/admin/outreach` du site `www` n'est pas une page d'administration fonctionnelle, mais elle ne révèle aucune donnée. Le site vitrine n'est pas dans l'espace de travail : je ne peux pas modifier son code.

Recommandation :

1. **Administration uniquement sur `hub.securium-agency.fr`.** Retirer toute route `/admin` du site vitrine, et ajouter dans son `next.config` une redirection permanente `/admin/:path*` vers `https://hub.securium-agency.fr/admin/:path*`.
2. **Pas de session partagée entre `www` et `hub`.** Un cookie de session sur `.securium-agency.fr` serait lisible par tous les sous-domaines. Le Hub garde sa session propre, protégée par le middleware.
3. **Pas de proxy Next.js** du Hub vers la vitrine : la redirection suffit et ne transporte pas de session.

## Restant à faire

- Renseigner l'adresse ou le dépôt de **Securium Labs** pour l'ajouter à la barre de navigation.
- Ajouter des **indicateurs d'état** (vitrine, Fleet) : une requête serveur par affichage, à cadencer.
- Vérifier le dépôt de la vitrine pour la route `/admin` et appliquer la redirection.
