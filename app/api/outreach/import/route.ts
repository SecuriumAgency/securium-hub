import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { parseOutreachBatch } from "@/lib/outreach";
import { prisma } from "@/lib/prisma";

const MAX_BODY_CHARS = 1024 * 1024;
// Un aller-retour vers la base par prospect, en série : depuis Vercel, 128 upserts dépassent le délai
// par défaut de Prisma (5 s) et la transaction expire. 90 s couvrent un lot plein (500 prospects).
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 90_000 };

// Synchronisation des prospects démarchés, appelée par scripts/migrate-outreach.mts.
// Header attendu : `Authorization: Bearer <HUB_SECRET_KEY>`.
// Corps : { prospects: [...], unsubscribedEmails: [...] }. Les désinscrits sont purgés, les prospects
// créés ou mis à jour par adresse. Route silencieuse : un prospect n'est pas un lead, aucune
// notification ne part (ni Discord, ni autre).
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
  const { prospects, unsubscribedEmails } = parsed;

  try {
    // Seulement pour compter créations et mises à jour : upsert ne dit pas lequel des deux il a fait.
    const existing = await prisma.outreachProspect.count({ where: { email: { in: prospects.map((prospect) => prospect.email) } } });
    // Une seule transaction : si une écriture échoue, rien n'est appliqué, purge comprise.
    const purged = await prisma.$transaction(async (tx) => {
      const { count } = await tx.outreachProspect.deleteMany({ where: { email: { in: unsubscribedEmails } } });
      for (const prospect of prospects) {
        await tx.outreachProspect.upsert({
          where: { email: prospect.email },
          create: prospect,
          // createdAt (premier contact) et company restent ceux du premier import.
          update: {
            status: prospect.status,
            lastContactAt: prospect.lastContactAt,
            phone: prospect.phone,
            source: prospect.source,
          },
        });
      }
      return count;
    }, TRANSACTION_OPTIONS);
    return NextResponse.json({
      received: prospects.length,
      created: prospects.length - existing,
      updated: existing,
      purged,
    });
  } catch (error) {
    console.error("[outreach] synchronisation impossible :", error);
    return NextResponse.json({ error: "Enregistrement du lot impossible." }, { status: 500 });
  }
}
