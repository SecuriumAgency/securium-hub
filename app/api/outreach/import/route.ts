import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { parseOutreachBatch } from "@/lib/outreach";
import { prisma } from "@/lib/prisma";

const MAX_BODY_CHARS = 1024 * 1024;
// Jusqu'à deux allers-retours vers la base par prospect mis à jour, en série : depuis Vercel, une centaine
// dépasse le délai par défaut de Prisma (5 s) et la transaction expire. 90 s couvrent un lot plein (500).
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 90_000 };

// Synchronisation des prospects démarchés, appelée par scripts/migrate-outreach.mts.
// Header attendu : `Authorization: Bearer <HUB_SECRET_KEY>`.
// Corps : { prospects: [...], unsubscribedEmails: [...] }. Les désinscrits sont purgés. Un prospect
// inconnu est créé ; un prospect connu n'est mis à jour que si le registre a un contact plus récent que
// le Hub : un email validé sur /admin/outreach (agent Chasseur) n'est donc pas écrasé par un registre
// plus ancien. Route silencieuse : un prospect n'est pas un lead, aucune notification ne part.
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
    // Une seule transaction : si une écriture échoue, rien n'est appliqué, purge comprise.
    const result = await prisma.$transaction(async (tx) => {
      // Leurs brouillons partent avec eux (suppression en cascade).
      const { count: purged } = await tx.outreachProspect.deleteMany({ where: { email: { in: unsubscribedEmails } } });

      const known = await tx.outreachProspect.findMany({
        where: { email: { in: prospects.map((prospect) => prospect.email) } },
        select: { email: true, lastContactAt: true },
      });
      const lastContact = new Map(known.map((prospect) => [prospect.email, prospect.lastContactAt]));
      const { count: created } = await tx.outreachProspect.createMany({
        data: prospects.filter((prospect) => !lastContact.has(prospect.email)),
        skipDuplicates: true,
      });

      let updated = 0;
      for (const prospect of prospects) {
        const hubContact = lastContact.get(prospect.email);
        if (!hubContact || prospect.lastContactAt <= hubContact) continue;
        // Contact plus récent dans le registre : il fait foi et rend obsolète un brouillon en attente.
        await tx.outreachDraft.deleteMany({ where: { prospect: { email: prospect.email } } });
        // createdAt (premier contact) et company restent ceux du premier import.
        await tx.outreachProspect.update({
          where: { email: prospect.email },
          data: { status: prospect.status, lastContactAt: prospect.lastContactAt, phone: prospect.phone, source: prospect.source },
        });
        updated++;
      }
      return { created, updated, unchanged: prospects.length - created - updated, purged };
    }, TRANSACTION_OPTIONS);
    return NextResponse.json({ received: prospects.length, ...result });
  } catch (error) {
    console.error("[outreach] synchronisation impossible :", error);
    return NextResponse.json({ error: "Enregistrement du lot impossible." }, { status: 500 });
  }
}
