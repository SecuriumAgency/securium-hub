import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { DRAFT_STATUS, type DraftRecord } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

// Brouillons de l'agent Chasseur en attente de validation (prospects au statut A_valider), lus par le
// panneau de /admin/outreach toutes les 30 s. Du plus ancien au plus récent.
export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  try {
    const prospects = await prisma.outreachProspect.findMany({
      where: { status: DRAFT_STATUS, draft: { isNot: null } },
      include: { draft: true },
    });
    const drafts: DraftRecord[] = prospects
      .flatMap(({ draft, ...prospect }) =>
        draft
          ? [
              {
                id: draft.id,
                prospectId: prospect.id,
                company: prospect.company,
                email: prospect.email,
                subject: draft.subject,
                body: draft.body,
                previousStatus: draft.previousStatus,
                model: draft.model,
                createdAt: draft.createdAt.toISOString(),
              },
            ]
          : [],
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return NextResponse.json({ drafts, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[drafts] lecture impossible :", error);
    return NextResponse.json({ error: "Lecture des brouillons impossible." }, { status: 500 });
  }
}
