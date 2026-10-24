import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { SENT_STATUS } from "@/lib/chasseur";
import { MailConfigError, sendOutreachEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { isWorkingTime } from "@/lib/schedule";

// Identifiant cuid : rien d'autre n'atteint la base.
const DRAFT_ID = /^[a-z0-9]{1,40}$/;
// La transaction attend la réponse du serveur SMTP (10 à 20 s au pire, voir lib/mail.ts).
const SEND_TRANSACTION = { maxWait: 10_000, timeout: 45_000 };

// Échec de l'envoi lui-même : rien n'est parti, la transaction est annulée.
class SendError extends Error {}

type Context = { params: Promise<{ id: string }> };

// Session admin et identifiant valides : l'id du brouillon, ou la réponse d'erreur à renvoyer.
async function draftId(context: Context) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  const { id } = await context.params;
  return DRAFT_ID.test(id) ? id : NextResponse.json({ error: "Identifiant de brouillon invalide." }, { status: 400 });
}

const notFound = () => NextResponse.json({ error: "Brouillon introuvable : déjà validé ou rejeté." }, { status: 404 });

// Valider : le Hub envoie l'email en SMTP (lib/mail.ts), puis le prospect passe à « Envoye », daté de
// maintenant, et le brouillon disparaît. Tout dans une transaction : si l'envoi échoue, rien n'est
// écrit, le brouillon reste, et la réponse 500 détaille l'erreur.
export async function PATCH(_request: NextRequest, context: Context) {
  const id = await draftId(context);
  if (id instanceof NextResponse) return id;
  // Même règle que l'agent Chasseur : aucun email de prospection ne part le week-end (heure de Paris).
  if (!isWorkingTime()) {
    return NextResponse.json(
      { error: "Envoi bloqué le week-end (heure de Paris) : brouillon conservé, à valider à partir de lundi." },
      { status: 423 },
    );
  }

  let emailSent = false;
  try {
    const prospect = await prisma.$transaction(async (tx) => {
      const draft = await tx.outreachDraft.findUnique({ where: { id }, include: { prospect: { select: { email: true } } } });
      if (!draft) return null;
      // Réserve le brouillon : une seconde validation simultanée attend ce verrou, puis ne trouve plus
      // rien. Un seul envoi par brouillon.
      const { count } = await tx.outreachDraft.deleteMany({ where: { id } });
      if (count === 0) return null;
      try {
        await sendOutreachEmail({ to: draft.prospect.email, subject: draft.subject, body: draft.body });
      } catch (error) {
        throw new SendError(error instanceof Error ? error.message : String(error), { cause: error });
      }
      emailSent = true;
      return tx.outreachProspect.update({
        where: { id: draft.prospectId },
        data: { status: SENT_STATUS, lastContactAt: new Date() },
        select: { id: true, status: true, lastContactAt: true },
      });
    }, SEND_TRANSACTION);
    return prospect ? NextResponse.json({ id, prospect }) : notFound();
  } catch (error) {
    if (error instanceof SendError) {
      console.error("[drafts] envoi SMTP impossible :", error.cause);
      const reason = error.cause instanceof MailConfigError ? "Envoi impossible : SMTP non configuré sur le Hub." : "Envoi de l'email impossible.";
      return NextResponse.json({ error: `${reason} Brouillon conservé, rien n'est parti.`, detail: error.message }, { status: 500 });
    }
    console.error("[drafts] validation impossible :", error);
    // L'email est parti mais l'enregistrement a échoué : le brouillon est revenu, ne pas le renvoyer.
    if (emailSent) {
      return NextResponse.json(
        {
          error: "Email envoyé, mais le statut n'a pas pu être enregistré : ne revalidez pas ce brouillon (double envoi), rejetez-le.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Validation du brouillon impossible.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// Rejeter : rien n'est parti. Le brouillon disparaît et le prospect retrouve son statut d'avant.
export async function DELETE(_request: NextRequest, context: Context) {
  const id = await draftId(context);
  if (id instanceof NextResponse) return id;
  try {
    const prospect = await prisma.$transaction(async (tx) => {
      const draft = await tx.outreachDraft.findUnique({ where: { id } });
      if (!draft) return null;
      await tx.outreachDraft.delete({ where: { id } });
      return tx.outreachProspect.update({
        where: { id: draft.prospectId },
        data: { status: draft.previousStatus },
        select: { id: true, status: true, lastContactAt: true },
      });
    });
    return prospect ? NextResponse.json({ id, prospect }) : notFound();
  } catch (error) {
    console.error("[drafts] rejet impossible :", error);
    return NextResponse.json({ error: "Rejet du brouillon impossible." }, { status: 500 });
  }
}
