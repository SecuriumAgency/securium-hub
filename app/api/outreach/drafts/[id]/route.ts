import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { MailConfigError } from "@/lib/mail";
import { RecordError, SendError, sendDraft } from "@/lib/outreach-send";
import { prisma } from "@/lib/prisma";
import { isWorkingTime, OFFICE_HOURS } from "@/lib/schedule";

// Identifiant cuid : rien d'autre n'atteint la base.
const DRAFT_ID = /^[a-z0-9]{1,40}$/;

type Context = { params: Promise<{ id: string }> };

// Session admin et identifiant valides : l'id du brouillon, ou la réponse d'erreur à renvoyer.
async function draftId(context: Context) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  const { id } = await context.params;
  return DRAFT_ID.test(id) ? id : NextResponse.json({ error: "Identifiant de brouillon invalide." }, { status: 400 });
}

const notFound = () => NextResponse.json({ error: "Brouillon introuvable : déjà validé ou rejeté." }, { status: 404 });

// Valider : envoi et enregistrement par sendDraft (lib/outreach-send.ts), le même chemin que l'envoi automatique.
// Rien n'est écrit si l'envoi échoue : le brouillon reste, et la réponse 500 détaille l'erreur.
export async function PATCH(_request: NextRequest, context: Context) {
  const id = await draftId(context);
  if (id instanceof NextResponse) return id;
  // Même calendrier que l'agent Chasseur : aucun email de prospection hors du lundi au vendredi, de 9h00 à
  // 18h00 à Paris. Refus avant toute écriture : le brouillon reste en attente.
  if (!isWorkingTime(new Date(), OFFICE_HOURS)) {
    return NextResponse.json(
      { error: "Envoi bloqué hors plage d'envoi (lundi au vendredi, 9h00 à 18h00, heure de Paris) : brouillon conservé." },
      { status: 423 },
    );
  }

  try {
    const outcome = await sendDraft(id);
    return outcome.status === "sent" ? NextResponse.json({ id, prospect: outcome.prospect }) : notFound();
  } catch (error) {
    if (error instanceof SendError) {
      console.error("[drafts] envoi SMTP impossible :", error.cause);
      const reason = error.cause instanceof MailConfigError ? "Envoi impossible : SMTP non configuré sur le Hub." : "Envoi de l'email impossible.";
      return NextResponse.json({ error: `${reason} Brouillon conservé, rien n'est parti.`, detail: error.message }, { status: 500 });
    }
    console.error("[drafts] validation impossible :", error);
    if (error instanceof RecordError) {
      // L'email est parti mais l'enregistrement a échoué : le brouillon est revenu, ne pas le renvoyer.
      return NextResponse.json(
        {
          error: "Email envoyé, mais le statut n'a pas pu être enregistré : ne revalidez pas ce brouillon (double envoi), rejetez-le.",
          detail: error.message,
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
