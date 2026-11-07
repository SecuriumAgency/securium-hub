import { OUTBOUND, SENT_STATUS } from "./chasseur";
import { PipelineStatus } from "./generated/prisma/enums";
import { sendOutreachEmail } from "./mail";
import { prisma } from "./prisma";

// Envoi d'un brouillon : le même chemin pour la validation à la main (PATCH /api/outreach/drafts/[id]) et pour
// l'envoi automatique (lib/auto-sender.ts). Un seul envoi par brouillon : le brouillon est réservé dans la transaction.

// La transaction attend la réponse du serveur SMTP (10 à 20 s au pire, voir lib/mail.ts).
export const SEND_TRANSACTION = { maxWait: 10_000, timeout: 45_000 };

/** Échec de l'envoi lui-même : rien n'est parti, la transaction est annulée. */
export class SendError extends Error {}

/**
 * L'email est parti, mais son enregistrement a échoué : le brouillon est revenu. Ne jamais le renvoyer.
 * Le Message-ID, s'il est connu, permet de retrouver l'envoi dans la boîte d'envoi.
 */
export class RecordError extends Error {
  constructor(
    message: string,
    readonly messageId: string | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type SendOutcome = { status: "sent"; prospect: { id: string; status: string; lastContactAt: Date } } | { status: "gone" };

/**
 * Envoie le brouillon, enregistre l'email dans l'historique (OutreachMessage OUTBOUND), puis passe le prospect à
 * « Envoye », daté de maintenant, et à « Email 1 Envoyé » au Kanban. Le brouillon disparaît.
 * Renvoie « gone » si le brouillon n'existe plus (déjà envoyé ou rejeté). Lève SendError si rien n'est parti,
 * RecordError si l'email est parti sans être enregistré.
 */
export async function sendDraft(id: string): Promise<SendOutcome> {
  let emailSent = false;
  let messageId: string | null = null;
  try {
    const prospect = await prisma.$transaction(async (tx) => {
      const draft = await tx.outreachDraft.findUnique({ where: { id }, include: { prospect: { select: { email: true } } } });
      if (!draft) return null;
      // Réserve le brouillon : une seconde validation simultanée attend ce verrou, puis ne trouve plus rien.
      const { count } = await tx.outreachDraft.deleteMany({ where: { id } });
      if (count === 0) return null;
      let sent: Awaited<ReturnType<typeof sendOutreachEmail>>;
      try {
        sent = await sendOutreachEmail({ to: draft.prospect.email, subject: draft.subject, body: draft.body });
      } catch (error) {
        throw new SendError(error instanceof Error ? error.message : String(error), { cause: error });
      }
      emailSent = true;
      messageId = sent.messageId || null;
      // Historique des échanges : l'email tel qu'il est parti, avec son Message-ID.
      await tx.outreachMessage.create({
        data: { prospectId: draft.prospectId, direction: OUTBOUND, subject: draft.subject, body: draft.body, messageId },
      });
      // Colonne du Kanban : un prospect encore au début du parcours passe à « Email 1 Envoyé ». Une colonne plus
      // avancée, posée à la main (relance, réponse, refus), reste telle quelle.
      await tx.outreachProspect.updateMany({
        where: { id: draft.prospectId, pipelineStatus: { in: [PipelineStatus.NOUVEAU, PipelineStatus.ICEBREAKER_GENERE] } },
        data: { pipelineStatus: PipelineStatus.EMAIL_1_ENVOYE },
      });
      return tx.outreachProspect.update({
        where: { id: draft.prospectId },
        data: { status: SENT_STATUS, lastContactAt: new Date() },
        select: { id: true, status: true, lastContactAt: true },
      });
    }, SEND_TRANSACTION);
    return prospect ? { status: "sent", prospect } : { status: "gone" };
  } catch (error) {
    if (error instanceof SendError) throw error;
    if (emailSent) throw new RecordError(error instanceof Error ? error.message : String(error), messageId, { cause: error });
    throw error;
  }
}
