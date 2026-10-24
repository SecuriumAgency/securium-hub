import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { SENT_STATUS } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

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

// Valider : l'email est parti depuis la messagerie de l'admin. Le prospect passe à « Envoye », daté de
// maintenant, et le brouillon disparaît, dans une seule transaction.
export async function PATCH(_request: NextRequest, context: Context) {
  const id = await draftId(context);
  if (id instanceof NextResponse) return id;
  try {
    const prospect = await prisma.$transaction(async (tx) => {
      const draft = await tx.outreachDraft.findUnique({ where: { id } });
      if (!draft) return null;
      await tx.outreachDraft.delete({ where: { id } });
      return tx.outreachProspect.update({
        where: { id: draft.prospectId },
        data: { status: SENT_STATUS, lastContactAt: new Date() },
        select: { id: true, status: true, lastContactAt: true },
      });
    });
    return prospect ? NextResponse.json({ id, prospect }) : notFound();
  } catch (error) {
    console.error("[drafts] validation impossible :", error);
    return NextResponse.json({ error: "Validation du brouillon impossible." }, { status: 500 });
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
