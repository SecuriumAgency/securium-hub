/*
 * Envoi automatique des brouillons de prescripteurs rédigés par le Chasseur. Même passage que la tâche planifiée
 * (app/api/cron/auto-sender), lancé à la main.
 *
 *   npx tsx scripts/auto-sender.mts                 essai à blanc (par défaut) : liste ce qui partirait, n'envoie rien
 *   npx tsx scripts/auto-sender.mts --send          envoie, dans la plage d'envoi (lundi au vendredi, 9h à 18h, Paris)
 *   Option --limit=<n> : nombre maximum d'emails par passage (défaut 10).
 *
 * Chaque brouillon est revérifié au moment de l'envoi : réponse reçue, désinscrit, blocklist, métier hors cible,
 * mention de désinscription absente. Un brouillon bloqué reste sur /admin/outreach pour une décision à la main.
 * Les adresses ne sont jamais affichées : seules les entreprises le sont.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const send = process.argv.includes("--send");
const limit = Number(option("limit") ?? 10);

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

if (!Number.isInteger(limit) || limit <= 0) fail("--limit doit être un entier positif.");

// lib/prisma.ts et lib/mail.ts lisent leur configuration à leur chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  const full = path.join(HUB_ROOT, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const { runAutoSender } = await import("../lib/auto-sender.ts");
const { prisma } = await import("../lib/prisma.ts");

try {
  const result = await runAutoSender({ now: new Date(), limit, dryRun: !send });
  if (result.status === "skipped") {
    console.log(`Passage non lancé : ${result.reason}.`);
  } else {
    console.log(`Brouillons éligibles : ${result.eligible}.`);
    for (const [reason, count] of Object.entries(result.blocked)) console.log(`  bloqué (${reason}) : ${count}`);
    if (result.dryRun) {
      console.log(`Essai à blanc : ${result.wouldSend?.length ?? 0} email(s) partiraient (au plus ${limit}).`);
      for (const company of result.wouldSend ?? []) console.log(`  → ${company}`);
      console.log("Rien n'a été envoyé. --send pour envoyer.");
    } else {
      console.log(`Envoyés : ${result.sent} ; échecs : ${result.failed}${result.stopped ? ` ; passage arrêté (${result.stopped})` : ""}.`);
    }
  }
} catch (error) {
  console.error("ERREUR :", error instanceof Error ? error.message : "erreur inconnue");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
