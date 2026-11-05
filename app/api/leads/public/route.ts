import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_SITE_ID, PublicLeadSchema } from "@/lib/public-leads-rules";
import { calculateSuggestedPrice, classifyLeadQuality } from "@/lib/broker/pricingEngine";
import { takeRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

// Route publique (sans session ni jeton) du tunnel /devis. Pur CRUD : aucun appel à un LLM.
const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "inconnu";
}

export async function POST(request: NextRequest) {
  const limit = takeRateLimit(clientIp(request), RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Demande trop volumineuse." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  // Champ piège (honeypot) : rempli uniquement par des robots. Réponse identique, rien n'est enregistré.
  const trap = (body as Record<string, unknown>).website;
  if (typeof trap === "string" && trap.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const parsed = PublicLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Formulaire incomplet.", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 422 },
    );
  }
  const lead = parsed.data;

  try {
    const message = lead.message ? lead.message : null;
    const email = lead.email ? lead.email : null;
    const quality = classifyLeadQuality({ urgency: lead.urgency, message, postalCode: lead.postalCode });
    // Deux écritures dans une transaction : le lead du Hub, et la fiche vendable du Lead Broker.
    await prisma.$transaction([
      prisma.lead.create({
        data: {
          siteId: PUBLIC_SITE_ID,
          name: lead.name,
          phone: lead.phone,
          email,
          service: lead.niche,
          source: "devis-public",
          status: "NOUVEAU",
          postalCode: lead.postalCode,
          region: lead.region,
          urgency: lead.urgency,
          message,
        },
      }),
      prisma.capturedLead.create({
        data: {
          name: lead.name,
          phone: lead.phone,
          email,
          niche: lead.niche,
          region: lead.region,
          postalCode: lead.postalCode,
          urgency: lead.urgency,
          message,
          consentToShare: lead.shareConsent === true,
          // Qualité et prix suggéré calculés ici, sans IA : même formulaire, même résultat.
          quality,
          suggestedPrice: calculateSuggestedPrice(quality, lead.niche),
        },
      }),
    ]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    // Seul le message sort dans les journaux : pas de données personnelles.
    console.error("[leads/public] enregistrement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible. Réessayez plus tard." }, { status: 500 });
  }
}
