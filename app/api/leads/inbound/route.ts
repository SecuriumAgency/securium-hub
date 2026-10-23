import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyDiscord } from "@/lib/discord";
import { parseInboundLead } from "@/lib/leads";

// Comparaison en temps constant. Hacher les deux valeurs aligne leurs longueurs, condition
// de timingSafeEqual, sans révéler la longueur de la clé.
function isAuthorized(header: string | null, secret: string) {
  const token = header?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(secret));
}

// Appelée côté serveur par les sites de la flotte à chaque formulaire envoyé.
// Header attendu : `Authorization: Bearer <HUB_SECRET_KEY>`.
export async function POST(request: NextRequest) {
  const secret = process.env.HUB_SECRET_KEY;
  if (!secret) {
    console.error("[inbound] HUB_SECRET_KEY n'est pas défini : leads refusés.");
    return NextResponse.json({ error: "Réception des leads non configurée." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = parseInboundLead(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Lead invalide.", details: parsed.errors }, { status: 422 });
  }

  try {
    const lead = await prisma.lead.create({ data: parsed.lead });
    // Discord est notifié après l'envoi de la réponse : le satellite n'attend pas Discord,
    // et un échec Discord ne fait pas perdre le lead, déjà enregistré.
    after(() => notifyDiscord(lead));
    return NextResponse.json({ id: lead.id, createdAt: lead.createdAt }, { status: 201 });
  } catch (error) {
    console.error("[inbound] enregistrement impossible :", error);
    return NextResponse.json({ error: "Enregistrement du lead impossible." }, { status: 500 });
  }
}
