import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { parseOutreachBatch } from "@/lib/outreach";
import { prisma } from "@/lib/prisma";

const MAX_BODY_CHARS = 1024 * 1024;

// Import en masse des prospects démarchés, appelé par scripts/migrate-outreach.mts.
// Header attendu : `Authorization: Bearer <HUB_SECRET_KEY>`. Corps : tableau de prospects.
// Route silencieuse : un prospect n'est pas un lead, aucune notification ne part (ni Discord, ni autre).
export async function POST(request: NextRequest) {
  const secret = process.env.HUB_SECRET_KEY;
  if (!secret) {
    console.error("[outreach] HUB_SECRET_KEY n'est pas défini : import refusé.");
    return NextResponse.json({ error: "Import non configuré." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Lot trop volumineux." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = parseOutreachBatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Lot invalide.", details: parsed.errors }, { status: 422 });
  }

  try {
    // Adresse déjà présente (contrainte unique sur email) : ignorée, un réimport n'écrase rien.
    const { count } = await prisma.outreachProspect.createMany({ data: parsed.prospects, skipDuplicates: true });
    const received = parsed.prospects.length;
    return NextResponse.json({ received, inserted: count, skipped: received - count }, { status: 201 });
  } catch (error) {
    console.error("[outreach] import impossible :", error);
    return NextResponse.json({ error: "Enregistrement du lot impossible." }, { status: 500 });
  }
}
