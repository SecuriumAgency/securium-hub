import { INBOUND } from "./chasseur";
import { PipelineStatus } from "./generated/prisma/enums";
import { normalizeEmail } from "./outreach";
import { prisma } from "./prisma";

// Réponse d'un prospect reçue par le webhook /api/webhooks/email-reply. Une réponse enregistrée (OutreachMessage
// INBOUND) bloque les envois suivants : la règle « a répondu » du Chasseur et l'envoi automatique la lisent.
// Un « STOP » en début de réponse désinscrit le prospect (blocklist, statut Desinscrit), sans attendre une action à la main.

const MAX_BODY_CHARS = 50_000;

export const isStop = (text: string) => /^\s*stop\b/i.test(text);

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

// ignored : l'expéditeur n'est pas un prospect. already : ce Message-ID est déjà enregistré. recorded : enregistré.
export type InboundOutcome = { status: "ignored" } | { status: "already" } | { status: "recorded"; stop: boolean };

export async function recordInboundReply(reply: InboundReply, now = new Date()): Promise<InboundOutcome> {
  const email = normalizeEmail(reply.from);
  const prospect = await prisma.outreachProspect.findUnique({ where: { email }, select: { id: true } });
  if (!prospect) return { status: "ignored" };

  const messageId = reply.messageId?.trim() || null;
  if (messageId && (await prisma.outreachMessage.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "already" };
  }

  const subject = reply.subject?.trim() || "(sans objet)";
  const body = clip(reply.text?.trim() || (reply.html ? htmlToText(reply.html) : "") || "(message vide)");
  const stop = isStop(body) || isStop(subject);

  await prisma.$transaction(async (tx) => {
    await tx.outreachMessage.create({
      data: { prospectId: prospect.id, direction: INBOUND, subject, body, messageId, createdAt: reply.date ?? now },
    });
    // Colonne du Kanban : une réponse passe la fiche à « Réponse reçue » ; un refus déjà posé reste tel quel.
    await tx.outreachProspect.updateMany({
      where: { id: prospect.id, pipelineStatus: { not: PipelineStatus.REFUS } },
      data: { pipelineStatus: stop ? PipelineStatus.REFUS : PipelineStatus.REPONDU },
    });
    if (stop) {
      await tx.outreachBlocklist.upsert({ where: { email }, create: { email }, update: {} });
      await tx.outreachProspect.update({ where: { id: prospect.id }, data: { status: "Desinscrit" } });
    }
  });
  return { status: "recorded", stop };
}
