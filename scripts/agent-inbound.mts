/*
 * Bot de réception : lit les réponses des prospects dans la boîte IMAP de l'agence (IONOS) et les enregistre dans
 * l'historique (OutreachMessage, direction INBOUND). Le passage est dans lib/inbound-imap.ts.
 *
 *   npx tsx scripts/agent-inbound.mts             traite les réponses non lues
 *   npx tsx scripts/agent-inbound.mts --dry-run   compte seulement : rien n'est écrit, aucun message n'est marqué
 *
 * Connexion : imap.ionos.fr:993 en TLS, avec IMAP_USER et IMAP_PASSWORD (à défaut SMTP_USER et SMTP_PASS).
 * Lancé toutes les 15 minutes sous PM2 (voir README). Une réponse « STOP » désinscrit le prospect (blocklist, statut
 * Desinscrit) ; une autre réponse le passe à « Répondu » dans le Kanban, ce qui arrête la relance.
 * Le journal ne contient ni adresse ni contenu.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  const full = path.join(HUB_ROOT, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const { imapCredentials, pollInbox } = await import("../lib/inbound-imap.ts");
const { prisma } = await import("../lib/prisma.ts");

try {
  const result = await pollInbox({ credentials: imapCredentials(), dryRun });
  console.log(`Boîte : ${result.unseen} non lu(s), dont ${result.fromProspects} de prospects.`);
  if (result.dryRun) {
    console.log(`Essai à blanc : ${result.recorded} réponse(s) seraient enregistrées, dont ${result.stops} STOP. Rien n'a été écrit ni marqué.`);
  } else {
    console.log(
      `${result.recorded} réponse(s) enregistrée(s), ${result.alreadyStored} déjà présente(s), ${result.stops} STOP ; ` +
        `${result.failed} en échec, ${result.leftForNextRun} reportée(s) au passage suivant.`,
    );
  }
} catch (error) {
  console.error(`Arrêt : ${error instanceof Error ? error.message : "erreur inconnue"}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
