import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { loadProspectionCounts } from "@/lib/prospection-counts";

// Compteurs de prospection pour la Batcave, rafraîchis toutes les 30 s. Réservé à l'admin : le middleware filtre /api/*,
// la route le revérifie.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  try {
    const counts = await loadProspectionCounts();
    return NextResponse.json({ ...counts, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[prospection] lecture des compteurs impossible :", error instanceof Error ? error.name : "erreur inconnue");
    return NextResponse.json({ error: "Base de prospection indisponible." }, { status: 503 });
  }
}
