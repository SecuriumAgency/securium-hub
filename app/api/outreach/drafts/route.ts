import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { CONTACTED_STATUSES, DRAFT_STATUS, type DraftRecord, type OutreachStats } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

// Brouillons de l'agent Chasseur en attente de validation (prospects au statut A_valider), du plus ancien
// au plus récent, et compteurs du Live Tracking : une seule requête du panneau de /admin/outreach toutes
// les 30 s.
export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  try {
    const [prospects, total, sent] = await Promise.all([
      prisma.outreachProspect.findMany({
        where: { status: DRAFT_STATUS, draft: { isNot: null } },
        include: { draft: true },
      }),
      prisma.outreachProspect.count(),
      // Un brouillon en attente fait passer le prospect à A_valider : il reste compté s'il avait déjà été contacté.
      prisma.outreachProspect.count({
        where: {
          OR: [
            { status: { in: CONTACTED_STATUSES } },
            { status: DRAFT_STATUS, draft: { is: { previousStatus: { in: CONTACTED_STATUSES } } } },
          ],
        },
      }),
    ]);
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
    const stats: OutreachStats = { prospects: total, drafts: drafts.length, sent };
    return NextResponse.json({ drafts, stats, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[drafts] lecture impossible :", error);
    return NextResponse.json({ error: "Lecture des brouillons impossible." }, { status: 500 });
  }
}
