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

`GET /api/fleet` renvoie la flotte avec, pour chaque projet référencé par `vercelProject` dans `lib/mock-data.json`, le statut de son dernier déploiement de production terminé : `READY` → en ligne, `ERROR` → hors ligne. Projet injoignable ou sans déploiement → statut inconnu (bâtiment gris). Le client interroge la route toutes les 30 s tant que l'onglet est visible. Leads et trafic restent fictifs.

Variables à définir dans `.env.local`, et dans les variables d'environnement du projet Vercel du Hub :

| Variable | Valeur |
| --- | --- |
| `VERCEL_API_TOKEN` | Token d'accès Vercel ayant accès à l'équipe `securium` |
| `VERCEL_TEAM_ID` | `team_K1mdpO6dtQjpoTnJDzuSXlt5` |

Sans token, la route répond 503 et tous les satellites restent en statut inconnu.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
