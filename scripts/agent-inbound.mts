/*
 * Agent de réception : lit les réponses des prospects dans la boîte IMAP de Securium Agency et les
 * enregistre dans l'historique des échanges (OutreachMessage, direction INBOUND).
 *
 *   npx tsx scripts/agent-inbound.mts             traite les emails non lus
 *   npx tsx scripts/agent-inbound.mts --dry-run   compte seulement : rien n'est écrit, aucun drapeau posé
 *
 * C'est la boîte de travail de l'agence : seuls les emails dont l'expéditeur est un prospect
 * d'OutreachProspect sont enregistrés puis marqués comme lus (\Seen). Tous les autres restent non lus,
 * intacts. Le contenu est lu en BODY.PEEK (imapflow, source: true), qui ne pose aucun drapeau.
 * Une réponse déjà enregistrée (même Message-ID) n'est pas dupliquée, mais elle est marquée comme lue.
 * Une réponse qui commence par « STOP » est signalée : à reporter dans la blocklist du prospecteur.
 * Le journal ne contient que des comptes et des identifiants de prospect, jamais d'adresse ni de contenu.
 *
 * Connexion : imap.ionos.fr:993 en TLS (IMAP_HOST et IMAP_PORT pour un autre serveur), avec SMTP_USER
 * et SMTP_PASS, ceux de l'envoi (.env.local puis .env du Hub). Au plus 200 emails non lus par passage.
 * Lancé avec tsx : le client Prisma généré importe ses modules sans extension.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_PER_RUN = 200;
// Au-delà, le corps est coupé : une réponse traîne souvent tout le fil cité.
const MAX_BODY_CHARS = 50_000;
const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}
const user = process.env.SMTP_USER?.trim() ?? fail("SMTP_USER introuvable (.env.local, .env).");
const pass = process.env.SMTP_PASS?.trim() ?? fail("SMTP_PASS introuvable (.env.local, .env).");
const host = process.env.IMAP_HOST?.trim() || "imap.ionos.fr";
const port = Number(process.env.IMAP_PORT) || 993;

const { ImapFlow } = await import("imapflow");
const { simpleParser } = await import("mailparser");
const { normalizeEmail } = await import("../lib/outreach.ts");
const { INBOUND } = await import("../lib/chasseur.ts");
const { prisma } = await import("../lib/prisma.ts");

// Repli quand l'email n'a qu'une partie HTML : balises retirées, entités courantes décodées.
function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clip = (text: string) => (text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS - 1)}…` : text);
const isStop = (text: string) => /^\s*stop\b/i.test(text);

const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
const stats = { unseen: 0, examined: 0, fromProspect: 0, stored: 0, alreadyStored: 0, stop: 0, ignored: 0 };

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    stats.unseen = uids.length;
    for (const uid of uids.slice(0, MAX_PER_RUN)) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) continue;
      stats.examined++;
      const parsed = await simpleParser(message.source);
      const from = parsed.from?.value[0]?.address;
      const prospect = from
        ? await prisma.outreachProspect.findUnique({ where: { email: normalizeEmail(from) }, select: { id: true } })
        : null;
      // Pas un prospect : l'email reste tel quel, non lu.
      if (!prospect) {
        stats.ignored++;
        continue;
      }
      stats.fromProspect++;

      const subject = parsed.subject?.trim() || "(sans objet)";
      const body = clip(parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "") || "(message vide)");
      if (isStop(body) || isStop(subject)) {
        stats.stop++;
        console.log(`STOP reçu du prospect ${prospect.id} : à ajouter à la blocklist du prospecteur (npm run blacklist).`);
      }
      if (dryRun) continue;

      const messageId = parsed.messageId?.trim() || null;
      const known = messageId ? await prisma.outreachMessage.findUnique({ where: { messageId }, select: { id: true } }) : null;
      if (known) {
        stats.alreadyStored++;
      } else {
        await prisma.outreachMessage.create({
          data: { prospectId: prospect.id, direction: INBOUND, subject, body, messageId, createdAt: parsed.date ?? new Date() },
        });
        stats.stored++;
      }
      // Marqué comme lu seulement une fois enregistré : un échec plus haut le laisse à traiter au prochain passage.
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }
  } finally {
    lock.release();
  }
  await client.logout();
} catch (error) {
  fail(`IMAP ${host}:${port} : ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await prisma.$disconnect();
}

console.log(
  `Boîte ${host} : ${stats.unseen} non lu(s), ${stats.examined} examiné(s) (au plus ${MAX_PER_RUN}). ` +
    `${stats.fromProspect} de prospects, ${stats.ignored} autre(s) laissé(s) non lu(s).`,
);
console.log(
  dryRun
    ? `Essai à blanc : rien n'a été enregistré ni marqué comme lu.${stats.stop > 0 ? ` ${stats.stop} STOP repéré(s).` : ""}`
    : `${stats.stored} réponse(s) enregistrée(s), ${stats.alreadyStored} déjà présente(s), marquées comme lues ; ${stats.stop} STOP.`,
);
