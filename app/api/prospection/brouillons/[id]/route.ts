import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const DRAFT_ID = /^[a-z0-9]{1,40}$/;

type Context = { params: Promise<{ id: string }> };

// Supprime une accroche par segment (bouton « Supprimer » du panneau de /admin/outreach). deleteMany et
// non delete : une accroche déjà supprimée (autre onglet) donne un compte nul, donc un 404, sans exception.
export async function DELETE(_request: NextRequest, context: Context) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!DRAFT_ID.test(id)) {
    return NextResponse.json({ error: "Identifiant d'accroche invalide." }, { status: 400 });
  }
  try {
    const { count } = await prisma.prospectionDraft.deleteMany({ where: { id } });
    if (count === 0) return NextResponse.json({ error: "Accroche introuvable : déjà supprimée." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[prospection] suppression impossible :", error);
    return NextResponse.json({ error: "Suppression de l'accroche impossible." }, { status: 500 });
  }
}
