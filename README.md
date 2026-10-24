This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Données live (API Vercel)

`GET /api/fleet` renvoie la flotte avec, pour chaque projet référencé par `vercelProject` dans `lib/mock-data.json`, le statut de son dernier déploiement de production terminé : `READY` → en ligne, `ERROR` → hors ligne. Projet injoignable ou sans déploiement → statut inconnu (bâtiment gris). Le client interroge la route toutes les 30 s tant que l'onglet est visible.

Variables à définir dans `.env`, et dans les variables d'environnement du projet Vercel du Hub :

| Variable | Valeur |
| --- | --- |
| `VERCEL_API_TOKEN` | Token d'accès Vercel ayant accès à l'équipe `securium` |
| `VERCEL_TEAM_ID` | `team_K1mdpO6dtQjpoTnJDzuSXlt5` |

Sans token, la route répond 503 et tous les satellites restent en statut inconnu.

## Base de leads (Prisma)

Le Hub est la source de vérité des leads. Les sites de la flotte les envoient à `POST /api/leads/inbound`, qui les enregistre puis les publie sur Discord. `GET /api/leads` renvoie l'historique complet, sans borne de date, et le nombre de leads par site ; le dashboard l'interroge toutes les 20 s : `{ monthStart, metrics: { [siteId]: { leadsThisMonth, leadsTotal } }, leads: [{ id, siteId, name, phone, email, service, source, createdAt }], updatedAt }`. Les leads sont triés du plus récent au plus ancien, et les compteurs sont calculés sur la même lecture. Le mois commence à minuit heure de Paris, et chaque site figure dans `metrics`, à 0 s'il n'a reçu aucun lead.

Au clic sur un bâtiment, le panneau d'inspection affiche ses leads (Date, Nom, Téléphone, Email, Service, Source) ; l'onglet « Toute la flotte » ajoute la colonne Dépôt et liste les leads de tous les sites. Le QG ouvre directement sur la flotte.

Toute la liste part au navigateur à chaque actualisation : au-delà de quelques milliers de leads, il faudra paginer la route (`take`/`cursor` sur `createdAt`) et ajouter un index sur `createdAt`. Pour une lecture complète, un index n'aide pas : Postgres lit toute la table puis trie.

La base est un Postgres Neon (Vercel Marketplace). Prisma 7 n'accepte plus les URL dans `prisma/schema.prisma` : la CLI se connecte via `prisma7.config.ts`, l'application via `lib/prisma.ts` (adaptateur `@prisma/adapter-pg`).

| Variable (`.env.local`) | Rôle |
| --- | --- |
| `POSTGRES_PRISMA_URL` | URL poolée (PgBouncer), utilisée par l'application |
| `POSTGRES_URL_NON_POOLING` | URL directe, utilisée par la CLI Prisma (`db push`, migrations) |
| `HUB_SECRET_KEY` | Clé partagée avec les sites ; sans elle, `/api/leads/inbound` répond 503 |
| `DISCORD_WEBHOOK_URL` | Webhook du salon des leads ; sans lui, les leads sont enregistrés mais pas notifiés |

Mise en place locale : `vercel env pull .env.local`, puis `npm install` (génère le client Prisma dans `lib/generated/prisma`). Après une modification du schéma : `npx prisma db push` (la table n'est pas mise à jour au déploiement), puis `npx prisma generate`.

Appel depuis un site, **toujours côté serveur** (route API, server action) : la clé ne doit jamais apparaître dans le code envoyé au navigateur.

```bash
curl -X POST https://<hub>/api/leads/inbound \
  -H "Authorization: Bearer $HUB_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"siteId":"elite-depannage-34","name":"Jean Dupont","phone":"06 12 34 56 78","email":"jean@example.com","service":"Serrurerie","source":"formulaire-contact"}'
```

`siteId` doit être un ID de `lib/mock-data.json`. `name`, `phone`, `service` et `source` sont requis, `email` est facultatif. Réponses : 201 `{ id, createdAt }`, 401 clé invalide, 422 lead invalide (`details` liste les erreurs).

## Prospection (outreach)

Les prospects démarchés par e-mail par `securium-prospector` vivent dans la table `OutreachProspect`, à part des leads entrants : ils n'entrent pas dans les métriques des sites et ne sont jamais notifiés sur Discord. Le panneau `/admin/outreach`, derrière la session admin, les liste du dernier contact au plus récent, avec le nombre de prospects par statut.

`scripts/migrate-outreach.mts` synchronise le Hub avec le registre `data/prospects.csv` du prospecteur, et peut être relancé à volonté. Lancé sans option, il fait un essai à blanc : il compte les prospects et les adresses à purger, et n'envoie rien. Avec `--send`, il envoie le tout à `POST /api/outreach/import`. Options : `--data=<dossier>` (`prospects.csv` et `blocklist.json`), `--hub=<url>` (par défaut la production ; HTTP accepté vers la machine locale seulement).

- **Regroupement** : le registre journalise des actions (envoi, relance), avec plusieurs lignes par prospect. Le script garde un prospect par adresse : premier contact (`createdAt`), dernière action (`lastContactAt`), dernier statut.
- **Mise à jour** : un prospect absent du Hub y est créé. Un prospect déjà présent n'est mis à jour (statut, dernier contact, téléphone, source) que si le registre a un contact plus récent que le Hub ; ce contact rend aussi obsolète un éventuel brouillon du Chasseur, qui est supprimé. Un email validé dans le Hub n'est donc jamais écrasé par un registre plus ancien. Le premier contact et l'entreprise restent ceux du premier import. Réponse : `{ received, created, updated, unchanged, purged }`.
- **RGPD** : un prospect désinscrit (une ligne `Desinscrit`, ou adresse dans `blocklist.json`) n'est jamais envoyé comme prospect. Son adresse part dans `unsubscribedEmails`, et le Hub le supprime s'il l'avait importé avant sa désinscription. Les lignes `Simulation` (essais à blanc du prospecteur) sont écartées une à une. Sans blocklist lisible, le script s'arrête. Seuls l'entreprise, l'adresse, le téléphone, le statut et les dates sont transmis.
- **Route** : `Authorization: Bearer <HUB_SECRET_KEY>`. Corps : `{ prospects: [...], unsubscribedEmails: [...] }`, avec au plus 500 prospects `{ company, email, phone, status, source, createdAt, lastContactAt }` (dates en ISO 8601) et au plus 5 000 adresses. Le lot est accepté entier ou refusé entier : 422 avec `details` si une entrée est invalide, si un prospect a le statut `Desinscrit` ou `Simulation`, ou si une adresse figure dans les deux listes. La purge (`deleteMany`) et les `upsert` par adresse s'exécutent dans une seule transaction interactive, avec un délai de 90 s : le délai par défaut de Prisma (5 s) ne suffit pas pour un upsert par prospect depuis Vercel. Si une écriture échoue, rien n'est appliqué. Réponse 200 `{ received, created, updated, purged }`.

### Agent Chasseur

`npx tsx scripts/agent-chasseur.mts` rédige avec Claude (`claude-opus-5-5` par défaut, `ANTHROPIC_MODEL` sinon) un email court pour chaque prospect qui peut être relancé. Il n'envoie rien : chaque email devient un brouillon (`OutreachDraft`), et le prospect passe au statut `A_valider`.

Sur `/admin/outreach`, le Live Tracking affiche trois compteurs : prospects ciblés, réponses à valider, emails envoyés. Ils sont rafraîchis avec les brouillons, en une seule requête, et suivent aussitôt chaque validation. Le panneau « Brouillons en attente (Chasseur) » affiche les brouillons sous forme de cartes, rafraîchies toutes les 30 s tant que l'onglet est visible. « Valider & Envoyer » fait envoyer l'email par le Hub, en SMTP depuis `SMTP_FROM` (`lib/mail.ts`, Nodemailer, version HTML et texte de repli), puis pose `Envoye` et le dernier contact. Si l'envoi échoue, rien n'est enregistré, le brouillon reste, et la carte affiche l'erreur du serveur. Aucun envoi le week-end (heure de Paris), comme pour l'agent. « Rejeter » rend au prospect son statut d'avant. La carte s'efface, puis les compteurs et le tableau de la page sont relus, sans rechargement. Routes, toutes derrière la session admin, revérifiée par chaque route (`lib/admin-session.ts`) :

| Route | Effet |
| --- | --- |
| `GET /api/outreach/drafts` | `{ drafts: [{ id, prospectId, company, email, subject, body, previousStatus, model, createdAt }], stats: { prospects, drafts, sent }, updatedAt }` : brouillons des prospects au statut `A_valider`, et compteurs du Live Tracking (prospects en base, brouillons en attente, prospects déjà contactés : statut `Envoye` ou `Relance_1`, y compris ceux en `A_valider` qui avaient l'un de ces statuts avant leur brouillon) |
| `GET /api/outreach/settings` | `{ settings: { productDescription, targetAudience, updatedAt } \| null }` : le brief de l'agent |
| `POST /api/outreach/settings` | Enregistre le brief. Corps JSON `{ productDescription, targetAudience }` (415 si le corps n'est pas du JSON, 422 si un champ est vide ou trop long) |
| `PATCH /api/outreach/drafts/[id]` | Valide et envoie, dans une seule transaction : le brouillon est réservé (une validation simultanée ne trouve plus rien, donc un seul envoi), l'email part en SMTP, puis le prospect passe à `Envoye` avec `lastContactAt` à maintenant. Envoi en échec : transaction annulée, brouillon conservé, 500 avec `detail`. 423 le week-end |
| `DELETE /api/outreach/drafts/[id]` | Rejette : brouillon supprimé, statut précédent rétabli |

Réponses : 401 sans session, 400 identifiant invalide, 404 brouillon déjà traité (le panneau retire alors la carte), 500 base indisponible.

- **Calendrier** : jamais le samedi ni le dimanche, et seulement de 9h00 à 18h00 sauf `--any-hour`. Double verrou du week-end, avant tout le reste. D'abord l'horloge de la machine (`getDay()`, Paris sur le poste) : « Agent en pause stricte (Week-end). », sans heure simulée possible. Puis l'heure de Paris (`isWorkingTime()` de `lib/schedule.ts`). Hors créneau, l'agent s'arrête sans toucher ni à la base ni à Claude.
- **Brief** : « Ce que tu vends » et « Ton client idéal », saisis dans Configuration de l'Agent sur `/admin/outreach` (table `AgentSettings`, ligne unique `default`, 2 000 caractères au plus par champ). L'agent les relit à chaque passage et les injecte, délimités, dans sa consigne ; les règles qui suivent (aucun fait inventé, longueur, signature) priment sur eux. Sans brief complet, l'agent s'arrête et demande à être briefé.
- **Cibles** : tous les prospects, sauf les adresses de `blocklist.json` (relue à chaque passage ; si elle est illisible, l'agent s'arrête), les statuts `Desinscrit` et `Simulation`, les prospects qui ont déjà un brouillon en attente et ceux contactés il y a moins de 7 jours. Au plus 5 brouillons par passage (`--limit=N`), du contact le plus ancien au plus récent.
- **Données envoyées à Claude** : l'entreprise, le domaine de l'adresse (sauf messagerie grand public) et l'historique de contact. Jamais l'adresse ni le téléphone. La consigne interdit d'inventer des faits.
- **Contrôles** : réponse JSON imposée par schéma, refus de Claude ignorés (repli serveur `fallbacks: "default"` activé), brouillon écarté s'il est vide, trop long ou trop court, s'il contient un gabarit non rempli ou un lien. Une mention d'opposition (« répondez STOP ») est ajoutée par le code. Les réponses STOP doivent être reportées dans la blocklist du prospecteur.
- **Essai à blanc** : `--dry-run` compte les prospects ciblables, sans appeler Claude ni écrire. `--now=<date ISO>` simule une autre heure, en essai à blanc seulement.

Variables : `ANTHROPIC_API_KEY` (ou un profil `ant auth login`) dans `.env.local`, en plus de `POSTGRES_PRISMA_URL`. L'agent tourne avec `tsx`, et non avec Node seul, parce que le client Prisma généré importe ses modules sans extension.

L'envoi a lieu sur le serveur qui reçoit la validation, donc sur Vercel en production : ces variables doivent figurer dans le projet Vercel du Hub, et pas seulement dans `.env.local`. Sans elles, la validation répond 500 « SMTP non configuré » et le brouillon reste.

| Variable | Rôle |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT` | Serveur d'envoi. Port 465 : TLS direct ; autre port : STARTTLS exigé |
| `SMTP_USER`, `SMTP_PASS` | Identifiants du compte d'envoi |
| `SMTP_FROM` | Expéditeur, par exemple `Securium Agency <contact@securium-agency.fr>`. Son adresse sert aussi à l'en-tête `List-Unsubscribe` (désinscription en un clic) |

### Messagerie

Chaque prospect a un historique d'échanges (`OutreachMessage`) : `OUTBOUND` pour un email envoyé par le Hub à la validation d'un brouillon, enregistré dans la même transaction que l'envoi ; `INBOUND` pour une réponse lue dans la boîte IMAP. Les emails antérieurs à la messagerie (registre du prospecteur) n'y figurent pas. Sur `/admin/outreach`, le bouton « Historique » de chaque prospect ouvre la conversation : plein écran sur mobile, panneau à droite à partir de `md`, vos emails à droite, ses réponses à gauche. Elle est relue toutes les 30 s tant que le panneau est ouvert (`GET /api/outreach/messages/[prospectId]`, session admin).

`npx tsx scripts/agent-inbound.mts` lit la boîte `imap.ionos.fr:993` (TLS) avec `SMTP_USER` et `SMTP_PASS`, ceux de l'envoi, et examine au plus 200 emails non lus par passage. `--dry-run` compte sans rien écrire ni marquer.

- **Seuls les emails de prospects sont touchés** : un email dont l'expéditeur est un prospect est enregistré, puis marqué comme lu. Tous les autres restent non lus : c'est la boîte de travail de l'agence. Le contenu est lu en `BODY.PEEK`, qui ne pose aucun drapeau.
- **Une réponse n'est enregistrée qu'une fois**, grâce à son `Message-ID`. Elle n'est marquée comme lue qu'après son enregistrement.
- **Une réponse qui commence par « STOP » est signalée dans le journal**, à reporter dans la blocklist du prospecteur (`npm run blacklist`). Le journal ne contient ni adresse ni contenu.
- **Un prospect qui a répondu n'est plus ciblé par l'agent Chasseur** : la suite se fait à la main.

Pour le faire tourner en tâche de fond sous PM2, même forme que le Chasseur, toutes les 15 minutes : `pm2 start "C:/Program Files/nodejs/node.exe" --name securium-inbound --cwd "C:/Securium-Workspace/securium-hub" --interpreter none --cron-restart "*/15 * * * *" --no-autorestart --time -- --import tsx scripts/agent-inbound.mts`.

### Rapport quotidien de la flotte

`scripts/fleet-daily-report.mts` envoie chaque soir un rapport par email : statut Vercel et leads (jour, mois, total) de chaque site, prospection (prospects contactés, brouillons à valider, emails envoyés et réponses du jour). La mise en page reprend celle de l'ancien « Rapport digital quotidien » de securium-agency-v2. Le rapport ne contient que des comptes : ni nom, ni téléphone, ni adresse. L'envoi passe par `lib/mail.ts` (variables `SMTP_*`), à `FLEET_REPORT_TO`, sinon `contact@securium-agency.fr`. Sans `VERCEL_API_TOKEN`, les statuts des sites sont marqués inconnus.

Il tourne sous PM2 : `ecosystem.config.js`, application `securium-fleet-report`, cron `0 20 * * *` à l'heure du poste (Paris), `autorestart: false`. PM2 lance `node --import tsx` directement. Ni `script: "npx"` (sous Windows, PM2 fait exécuter `npx.cmd` par Node comme du JavaScript) ni le `.mts` en script (le conteneur de PM2 le charge avec `require()`) ne fonctionnent.

```bash
pm2 start ecosystem.config.js --only securium-fleet-report               # enregistre et envoie un premier rapport tout de suite
pm2 start ecosystem.config.js --only securium-fleet-report --env dryrun  # essai à blanc : HTML dans le dossier temporaire, aucun envoi
pm2 logs securium-fleet-report                                           # lignes « [FleetReport] Rapport envoyé avec succès à … »
pm2 delete securium-fleet-report                                         # retire la tâche
pm2 save                                                                 # la conserve au redémarrage de Windows
```

Journaux : `Securium-OS/logs/pm2-fleet-report-*.log`. Sans PM2 : `npx tsx scripts/fleet-daily-report.mts --dry-run`.

Le workflow GitHub `daily-report.yml` de securium-agency-v2 reste distinct. Il envoie chaque soir les données d'audience GA4 et Search Console, que seul GitHub peut lire (compte de service dans ses secrets). Ce rapport-ci ne les reprend pas.

### Design system des pages admin

Les pages admin (`/admin/*`, `components/admin/`) n'utilisent que les jetons sémantiques définis dans `app/globals.css` (Tailwind v4, bloc `@theme`) : `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, et pour les accents `primary`, `success`, `destructive`, `warning`, `draft`, avec ou sans opacité (`bg-primary/10`). Aucune couleur arbitraire. Elles sont pensées mobile d'abord : les classes sans préfixe visent les écrans de 320 px, `sm:`/`md:` élargissent la mise en page. Navigation en tiroir sur mobile, barre étendue à partir de `md` (`AdminNav`). Les zones cliquables font au moins 44 × 44 px. La page bloque le défilement horizontal, et les textes longs sont coupés (`truncate`) ou renvoyés à la ligne (`break-words`).

## Accès admin

Tout le Hub (dashboard, `/admin/outreach`, `/api/fleet`, `/api/leads`, `/api/outreach/drafts`, `/api/outreach/settings`, `/api/outreach/messages`, `GET /api/telemetry`) exige une session admin, sauf `/login`, `/api/leads/inbound` et `POST /api/outreach/import`, protégées par `HUB_SECRET_KEY`, et `POST /api/telemetry`, protégée par `HUB_API_KEY`. Sans session valide, `middleware.ts` redirige une page vers `/login` et répond 401 à un appel d'API.

`/login` compare le mot de passe à `ADMIN_PASSWORD`, puis pose le cookie HttpOnly `securium_admin_session`, valable 7 jours et signé HMAC-SHA256 avec `SESSION_SECRET` (`lib/session.ts`) : un cookie modifié, expiré ou signé avec une autre clé est refusé. Changer `SESSION_SECRET` déconnecte toutes les sessions.

| Variable (`.env` et projet Vercel) | Rôle |
| --- | --- |
| `ADMIN_PASSWORD` | Mot de passe de `/login` |
| `SESSION_SECRET` | Clé de signature des sessions, 32 caractères minimum ; sans elle, toute connexion est refusée |

Générer `SESSION_SECRET` : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Télémétrie des agents

Le poste Securium pousse l'état de ses agents vers le Hub : le daemon `securium-fleet-watch` (`Securium-OS/agent-dashboard`, `scripts/hub-telemetry.mts`) envoie un rapport toutes les 10 s à `POST /api/telemetry`. Le panneau « Agents » à gauche le relit toutes les 10 s par `GET /api/telemetry`. La télémétrie fonctionne donc sur Vercel comme en local.

Contenu du rapport, calculé sur le poste :

- **Statut des agents** : un agent est actif quand son script (`scripts/run-cfo.sh`, `run-devops.sh`, `run-prospector.sh`, `run-seo.sh`, `simulate-market.sh`, `sec-orchestrator.sh`) tourne dans un `bash.exe` du poste (PowerShell, `Get-CimInstance Win32_Process`). Un agent arrêté dont la dernière ligne est une erreur passe en « Erreur ».
- **Journal** : les 64 derniers Ko de `Securium-OS/logs/agent-activity.log` donnent la dernière action de chaque agent et les 40 lignes les plus récentes. Les lignes ne sont pas horodatées : seule la date de dernière écriture du fichier est transmise.
- **Processus PM2** : nom, statut, démarrage, redémarrages, mémoire, CPU et cron de chaque processus (`pm2 jlist`). Leur environnement, qui contient des secrets, n'est jamais envoyé.

`POST /api/telemetry` attend `Authorization: Bearer <HUB_API_KEY>` et un corps JSON de 256 Ko au plus. Le canal est chiffré par HTTPS : le daemon refuse une URL en `http://`, sauf vers la boucle locale (Hub en développement). Réponses : 200 `{ receivedAt }`, 400 JSON invalide, 401 clé invalide, 413 rapport trop volumineux, 422 rapport invalide (`details` liste les erreurs), 503 `HUB_API_KEY` absente ou de moins de 32 caractères. Les textes trop longs sont tronqués et les listes coupées (32 agents, 40 lignes, 32 processus) : seul un champ du mauvais type fait rejeter le rapport. La forme du rapport est `TelemetryReport` dans `lib/telemetry.ts`.

La scène 3D lit le même état, par le store de `lib/use-telemetry.ts`, que `Home` alimente ; seul le dernier rapport frais compte. Si l'Orchestrateur est en erreur, la tour du QG pulse en rouge, entourée d'une aura. Si `securium-fleet-watch` est en ligne dans PM2, un anneau cyan respire autour du terrain du QG. Les deux effets s'allument et s'éteignent en fondu, animés dans `useFrame` : seul le composant concerné se re-rend quand un signal bascule, jamais le `<Canvas>`. Règles : `telemetrySignals` dans `lib/telemetry.ts`.

Le dernier rapport est gardé dans le Runtime Cache de Vercel (`@vercel/functions`), partagé par les instances de la région, sans écriture en base toutes les 10 s. Il reste lisible 24 h. Au-delà de 30 s sans rapport (trois rapports manqués), `GET` le signale périmé (`stale`) : le panneau affiche alors les agents en « Inconnu » et indique depuis quand le poste ne répond plus. Hors Vercel (`npm run dev`), le cache est en mémoire du processus : il se vide au redémarrage du serveur.

| Variable | Où | Rôle |
| --- | --- | --- |
| `HUB_API_KEY` | projet Vercel du Hub, et `.env.local` d'`agent-dashboard` | Clé partagée avec le daemon, 32 caractères minimum, la même des deux côtés. Sans elle, `POST /api/telemetry` répond 503 |

Générer la clé : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
