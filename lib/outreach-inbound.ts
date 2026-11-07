import { INBOUND } from "./chasseur";
import { PipelineStatus } from "./generated/prisma/enums";
import { isStopRequest, newContent } from "./inbound-mail";
import { normalizeEmail } from "./outreach";
import { prisma } from "./prisma";

// Réponse d'un prospect, lue dans la boîte IMAP (lib/inbound-imap.ts). Une réponse enregistrée (OutreachMessage
// INBOUND) bloque les envois suivants : la règle « a répondu » du Chasseur et l'envoi automatique la lisent.
// - « STOP » dans le texte nouveau ou l'objet : désinscription (blocklist, statut Desinscrit, Kanban « Refus ») ;
// - sinon : Kanban « Réponse reçue » (REPONDU). Le statut du registre, qui règle les envois, ne change pas.

const MAX_BODY_CHARS = 50_000;

// Repli quand la réponse n'a qu'une partie HTML : balises retirées, entités courantes décodées.
export function htmlToText(html: string) {
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

export type InboundReply = {
  from: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  messageId?: string | null;
  date?: Date | null;
};

// ignored : l'expéditeur n'est pas un prospect. already : ce Message-ID est déjà enregistré.
// recorded : enregistré ; `applied` dit ce qui a changé sur la fiche (« Desinscrit », « REPONDU » ou « inchangé »).
export type InboundOutcome =
  | { status: "ignored" }
  | { status: "already" }
  | { status: "recorded"; prospectId: string; stop: boolean; applied: "Desinscrit" | "REPONDU" | "inchangé" };

export async function recordInboundReply(reply: InboundReply, now = new Date()): Promise<InboundOutcome> {
  const email = normalizeEmail(reply.from);
  const prospect = await prisma.outreachProspect.findUnique({ where: { email }, select: { id: true } });
  if (!prospect) return { status: "ignored" };

  const messageId = reply.messageId?.trim() || null;
  if (messageId && (await prisma.outreachMessage.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "already" };
  }

  const subject = reply.subject?.trim() || "(sans objet)";
  const raw = reply.text?.trim() || (reply.html ? htmlToText(reply.html) : "");
  const body = clip(raw || "(message vide)");
  const stop = isStopRequest(newContent(raw), subject);

  const applied = await prisma.$transaction(async (tx) => {
    await tx.outreachMessage.create({
      data: { prospectId: prospect.id, direction: INBOUND, subject, body, messageId, createdAt: reply.date ?? now },
    });
    if (stop) {
      await tx.outreachBlocklist.upsert({ where: { email }, create: { email }, update: {} });
      await tx.outreachProspect.update({
        where: { id: prospect.id },
        data: { status: "Desinscrit", pipelineStatus: PipelineStatus.REFUS },
      });
      return "Desinscrit" as const;
    }
    // Un refus déjà posé à la main reste tel quel.
    const updated = await tx.outreachProspect.updateMany({
      where: { id: prospect.id, pipelineStatus: { not: PipelineStatus.REFUS } },
      data: { pipelineStatus: PipelineStatus.REPONDU },
    });
    return updated.count === 1 ? ("REPONDU" as const) : ("inchangé" as const);
  });
  return { status: "recorded", prospectId: prospect.id, stop, applied };
}
