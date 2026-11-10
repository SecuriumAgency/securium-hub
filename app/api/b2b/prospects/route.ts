import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { loadB2BProspects } from "@/lib/b2b/prospects";
import type { B2BProspectsResponse } from "@/lib/b2b/types";

// Demandes B2B, réservées à l'admin. Le middleware filtre déjà /api/*, la route le revérifie.
// Les données ne sortent que par cette réponse JSON : elles ne figurent dans aucun fichier du dépôt ni du build statique.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const body: B2BProspectsResponse = { prospects: loadB2BProspects(), updatedAt: new Date().toISOString() };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
