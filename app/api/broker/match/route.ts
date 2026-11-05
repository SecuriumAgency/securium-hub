import { NextResponse, type NextRequest } from "next/server";
import { findEligibleArtisans } from "@/lib/broker/matchingServer";

// Artisans compatibles avec la sélection (niche et zone, pour chaque lead). Session admin (middleware).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("leadIds") ?? "";
  const leadIds = [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
  if (leadIds.length === 0 || leadIds.length > 200 || leadIds.some((id) => id.length > 64)) {
    return NextResponse.json({ error: "Sélection invalide." }, { status: 422 });
  }
  try {
    const artisans = await findEligibleArtisans(leadIds);
    return NextResponse.json({ artisans });
  } catch (error) {
    console.error("[broker/match] recherche impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Recherche impossible." }, { status: 500 });
  }
}
