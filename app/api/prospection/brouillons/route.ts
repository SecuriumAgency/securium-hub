import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { PROSPECTION_DRAFT_STATUS, type ProspectionDraftRecord } from "@/lib/ai/chasseur-generator";
import { prisma } from "@/lib/prisma";

// Lue à chaque requête, jamais mise en cache : l'agent écrit de nouvelles accroches entre deux relevés.
export const dynamic = "force-dynamic";

// Accroches par segment de l'agent Chasseur (scripts/agent-chasseur-segments.mts) au statut
// brouillon_en_attente, de la plus récente à la plus ancienne : lues par le panneau de /admin/outreach
// toutes les 30 s.
export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  try {
    const rows = await prisma.prospectionDraft.findMany({
      where: { status: PROSPECTION_DRAFT_STATUS },
      orderBy: { createdAt: "desc" },
    });
    const drafts: ProspectionDraftRecord[] = rows.map(({ id, segment, sector, zone, subject, body, model, createdAt }) => ({
      id,
      segment,
      sector,
      zone,
      subject,
      body,
      model,
      createdAt: createdAt.toISOString(),
    }));
    return NextResponse.json({ drafts, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[prospection] lecture impossible :", error);
    return NextResponse.json({ error: "Lecture des accroches impossible." }, { status: 500 });
  }
}
