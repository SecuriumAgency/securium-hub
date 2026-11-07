import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isStopRequest, newContent } from "./inbound-mail";
import { normalizeEmail } from "./outreach";
import { prisma } from "./prisma";
import { htmlToText, recordInboundReply } from "./outreach-inbound";

// Bot de réception : lit les réponses des prospects dans la boîte IMAP de l'agence (IONOS, TLS) et les enregistre.
// Lancé par scripts/agent-inbound.mts, toutes les 15 minutes sous PM2 (voir README). Seuls les messages dont l'expéditeur
// est un prospect sont téléchargés, enregistrés, puis marqués comme lus. Les autres restent non lus, intacts.
// Un message n'est marqué comme lu qu'après son enregistrement : un échec le laisse pour le passage suivant.

const DEFAULT_HOST = "imap.ionos.fr";
const DEFAULT_PORT = 993;
// Au plus autant de réponses de prospects traitées par passage ; le reste reste non lu, pour le passage suivant.
const MAX_PER_RUN = 200;
// Enveloppes lues par lot : seul l'expéditeur est lu à ce stade, jamais le message.
const ENVELOPE_CHUNK = 500;

export type ImapCredentials = { host: string; port: number; user: string; pass: string };

/** Identifiants de la boîte : IMAP_USER et IMAP_PASSWORD, à défaut ceux de l'envoi (SMTP_USER et SMTP_PASS). */
export function imapCredentials(env: NodeJS.ProcessEnv = process.env): ImapCredentials {
  // `||` et non `??` : une variable présente mais vide (IMAP_USER="" dans .env.example) doit laisser passer le repli.
  const user = (env.IMAP_USER || env.SMTP_USER || "").trim();
  const pass = (env.IMAP_PASSWORD || env.SMTP_PASS || "").trim();
  if (!user || !pass) throw new Error("identifiants IMAP absents : IMAP_USER et IMAP_PASSWORD (à défaut SMTP_USER et SMTP_PASS).");
  return { host: env.IMAP_HOST?.trim() || DEFAULT_HOST, port: Number(env.IMAP_PORT) || DEFAULT_PORT, user, pass };
}

export type PollResult = {
  dryRun: boolean;
  unseen: number;
  fromProspects: number;
  recorded: number;
  alreadyStored: number;
  stops: number;
  failed: number;
  leftForNextRun: number;
};

/**
 * Un passage sur la boîte. En essai à blanc : rien n'est écrit, aucun message n'est marqué. Le journal ne contient ni
 * adresse ni contenu : domaine de l'expéditeur, identifiant de fiche, effet appliqué.
 */
export async function pollInbox({
  credentials,
  dryRun,
  now = new Date(),
}: {
  credentials: ImapCredentials;
  dryRun: boolean;
  now?: Date;
}): Promise<PollResult> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
  });
  const result: PollResult = { dryRun, unseen: 0, fromProspects: 0, recorded: 0, alreadyStored: 0, stops: 0, failed: 0, leftForNextRun: 0 };

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = ((await client.search({ seen: false }, { uid: true })) || []) as number[];
      result.unseen = uids.length;

      // 1. Expéditeur de chaque non lu, par l'enveloppe seulement. Sans ce filtre, les messages d'autres expéditeurs
      //    resteraient non lus et occuperaient la limite de passage, au détriment des réponses de prospects.
      const senderOf = new Map<number, string>();
      for (let i = 0; i < uids.length; i += ENVELOPE_CHUNK) {
        const chunk = uids.slice(i, i + ENVELOPE_CHUNK).join(",");
        for await (const message of client.fetch(chunk, { envelope: true }, { uid: true })) {
          const address = message.envelope?.from?.[0]?.address;
          if (address) senderOf.set(message.uid, normalizeEmail(address));
        }
      }

      // 2. Seuls les expéditeurs qui sont des prospects du registre.
      const senders = [...new Set(senderOf.values())];
      const prospects = new Set(
        senders.length
          ? (await prisma.outreachProspect.findMany({ where: { email: { in: senders } }, select: { email: true } })).map((row) => row.email)
          : [],
      );
      const matching = [...senderOf].filter(([, sender]) => prospects.has(sender)).map(([uid]) => uid);
      result.fromProspects = matching.length;
      result.leftForNextRun = Math.max(0, matching.length - MAX_PER_RUN);

      // 3. Lecture, enregistrement, puis marquage comme lu.
      for (const uid of matching.slice(0, MAX_PER_RUN)) {
        try {
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message || !message.source) {
            result.failed++;
            continue;
          }
          const parsed = await simpleParser(message.source);
          const html = typeof parsed.html === "string" ? parsed.html : null;
          const text = parsed.text ?? "";
          const subject = parsed.subject ?? null;
          const reply = {
            from: parsed.from?.value[0]?.address ?? senderOf.get(uid) ?? "",
            subject,
            text: text || null,
            html,
            messageId: parsed.messageId ?? null,
            date: parsed.date ?? null,
          };

          if (dryRun) {
            result.recorded++;
            if (isStopRequest(newContent(text || (html ? htmlToText(html) : "")), subject ?? "")) result.stops++;
            continue;
          }

          const outcome = await recordInboundReply(reply, now);
          // Expéditeur devenu inconnu entre-temps : rien n'est fait, le message reste non lu.
          if (outcome.status === "ignored") continue;
          if (outcome.status === "already") {
            result.alreadyStored++;
          } else {
            result.recorded++;
            if (outcome.stop) result.stops++;
            console.log(
              JSON.stringify({
                evt: "inbound.imap",
                status: "recorded",
                prospect: outcome.prospectId,
                senderDomain: normalizeEmail(reply.from).split("@")[1] ?? null,
                applied: outcome.applied,
                stop: outcome.stop,
              }),
            );
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch (error) {
          result.failed++;
          console.error(`[inbound] message non traité : ${error instanceof Error ? error.message : "erreur inconnue"}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return result;
}
