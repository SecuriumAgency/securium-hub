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

## Accès admin

Tout le Hub (dashboard, `/api/fleet`, `/api/leads`, `GET /api/telemetry`) exige une session admin, sauf `/login`, `/api/leads/inbound`, protégée par `HUB_SECRET_KEY`, et `POST /api/telemetry`, protégée par `HUB_API_KEY`. Sans session valide, `middleware.ts` redirige une page vers `/login` et répond 401 à un appel d'API.

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
