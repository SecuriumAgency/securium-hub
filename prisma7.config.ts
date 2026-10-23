import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Mêmes fichiers que Next.js : `.env.local` (créé par `vercel env pull`) prime sur `.env`.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Connexion directe, sans PgBouncer : `db push` et les migrations en ont besoin. Seules ces
  // commandes l'exigent : `prisma generate` (postinstall, build Vercel) doit fonctionner sans.
  datasource: { url: process.env.POSTGRES_URL_NON_POOLING },
});
