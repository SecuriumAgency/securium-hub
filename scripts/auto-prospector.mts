/*
 * Prospection automatisée des prescripteurs B2B (syndics, agences immobilières, architectes, promoteurs) en
 * Île-de-France, zone de Géo Energie Habitat. Source : OpenStreetMap via Overpass (sans clé d'API).
 * Google Places n'est pas branché : aucune clé n'est définie dans l'environnement.
 *
 *   npx tsx scripts/auto-prospector.mts                  essai à blanc (par défaut) : interroge, filtre, n'écrit rien
 *   npx tsx scripts/auto-prospector.mts --apply          écrit en base, en une seule transaction
 *   npx tsx scripts/auto-prospector.mts --source=mock    jeu de test structuré ; refusé avec --apply
 *   Option --sites=<n> : nombre maximum de sites web visités pour y trouver un e-mail (défaut 40).
 *
 * Le passage est dans lib/auto-prospector-run.ts, le même que le passage planifié (app/api/cron/prospector).
 * Chaque résultat passe le filtre de sécurité de l'import CSV : métier obligatoire, toiture exclue, blocklist,
 * doublon en base. Un prospect valide entre au statut « Nouveau », sans icebreaker : le Chasseur lui rédige le
 * premier email, en brouillon à valider sur /admin/outreach. Rien n'est envoyé ici.
 * Les e-mails ne sont jamais affichés dans les logs.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZONE_LABEL } from "../lib/auto-prospector.ts";
import type { ProspectorRun, ProspectorSource } from "../lib/auto-prospector-run.ts";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");
const source = option("source") ?? "overpass";
const siteLimit = Number(option("sites") ?? 40);

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

if (source !== "overpass" && source !== "mock") fail(`source inconnue : ${source} (overpass ou mock).`);
if (apply && source === "mock") fail("le jeu de test ne s'écrit jamais en base.");
if (!Number.isInteger(siteLimit) || siteLimit < 0) fail("--sites doit être un entier positif ou nul.");

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  const full = path.join(HUB_ROOT, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const { runProspector } = await import("../lib/auto-prospector-run.ts");

function report(run: ProspectorRun) {
  const { plan } = run;
  console.log(`Source : ${run.source === "mock" ? "jeu de test (aucune donnée réelle)" : `OpenStreetMap via Overpass, zone ${ZONE_LABEL}`}`);
  for (const line of run.perQuery) console.log(`  ${line}`);
  console.log(`Retenus après métier visé : ${run.screened} (hors métier visé : ${run.rejectedMetier})`);
  console.log(`Sites visités pour un e-mail : ${run.visited} ; e-mails trouvés sur les sites : ${run.foundOnSite}`);
  console.log(`Sans e-mail, non écrits : ${run.withoutEmail}`);
  console.log(`Valides, à créer en statut Nouveau : ${plan.creates.length}`);
  const byMetier = new Map<string, number>();
  for (const creation of plan.creates) byMetier.set(creation.activity, (byMetier.get(creation.activity) ?? 0) + 1);
  for (const [metier, count] of byMetier) console.log(`  ${metier} : ${count}`);
  for (const creation of plan.creates.slice(0, 10)) console.log(`  + ${creation.company}`);
  if (plan.creates.length > 10) console.log(`  … et ${plan.creates.length - 10} autre(s)`);
  console.log(`Déjà en base, champs vides à compléter : ${plan.completions.length}`);
  console.log(`Déjà en base, rien à compléter : ${plan.unchanged}`);
  console.log(`Rejetées par le registre : ${plan.rejections.length}`);
  for (const rejection of plan.rejections) console.log(`  AVERT ${rejection.label} : ${rejection.reason}`);
  if (run.written) {
    console.log(`Écrit : ${run.written.created} créé(s), ${run.written.completed} complété(s), en une seule transaction.`);
  } else {
    console.log("Essai à blanc : rien n'est écrit. --apply pour écrire.");
  }
}

try {
  const run = await runProspector({ source: source as ProspectorSource, siteLimit, apply });
  report(run);
} catch (error) {
  console.error("ERREUR : rien n'est écrit :", error instanceof Error ? error.message : "erreur inconnue");
  process.exitCode = 1;
} finally {
  const { prisma } = await import("../lib/prisma.ts");
  await prisma.$disconnect();
}
