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

Le Hub est la source de vérité des leads. Les sites de la flotte les envoient à `POST /api/leads/inbound`, qui les enregistre puis les publie sur Discord. `GET /api/leads` renvoie le nombre de leads par site, interrogé toutes les 60 s par le HUD : `{ monthStart, metrics: { [siteId]: { leadsThisMonth, leadsTotal } }, updatedAt }`. Le mois commence à minuit heure de Paris, et chaque site figure dans la réponse, à 0 s'il n'a reçu aucun lead.

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
