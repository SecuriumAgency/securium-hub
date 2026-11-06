import { NextResponse, type NextRequest } from "next/server";
import { DECLARATION_MAX_ZONES, DeclarationSchema, isDeclarationNiche, parseZones } from "@/lib/broker/declaration-rules";
import { readDeclarationToken } from "@/lib/broker/declaration-token";
import { prisma } from "@/lib/prisma";
import { takeRateLimit } from "@/lib/rate-limit";

// Déclaration d'un acheteur depuis son lien signé. Route publique (voir PUBLIC_POSTS dans middleware.ts) :
// le jeton est la seule autorisation, et il ne permet de modifier que les niches et zones de son prospect.
export const dynamic = "force-dynamic";

const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien à Securium.";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "inconnu";
}

export async function POST(request: NextRequest) {
  const limit = takeRateLimit(clientIp(request), RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = DeclarationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Formulaire incomplet." }, { status: 422 });

  const niches = [...new Set(parsed.data.niches)];
  if (!niches.every(isDeclarationNiche)) return NextResponse.json({ error: "Métier inconnu." }, { status: 422 });

  const { zones, invalid } = parseZones(parsed.data.zones);
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Zones non reconnues : ${invalid.slice(0, 10).join(", ")}. Indiquez des codes postaux à 5 chiffres ou des départements.` },
      { status: 422 },
    );
  }
  if (zones.length === 0) return NextResponse.json({ error: "Indiquez au moins une zone." }, { status: 422 });
  if (zones.length > DECLARATION_MAX_ZONES) {
    return NextResponse.json({ error: `Maximum ${DECLARATION_MAX_ZONES} zones.` }, { status: 422 });
  }

  const prospectId = await readDeclarationToken(parsed.data.token);
  if (!prospectId) return NextResponse.json({ error: INVALID_LINK }, { status: 401 });

  try {
    await prisma.outreachProspect.update({
      where: { id: prospectId },
      data: { targetNiches: niches, targetZipCodes: zones },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Prospect supprimé entre-temps : même réponse qu'un lien invalide, pour ne rien révéler.
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
    console.error("[partenaire] déclaration impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible. Réessayez plus tard." }, { status: 500 });
  }
}
