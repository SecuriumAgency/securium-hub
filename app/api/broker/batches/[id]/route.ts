import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const BATCH_ID = /^[a-z0-9]{1,40}$/;
const BodySchema = z.object({ status: z.literal("PAID") });

// Encaissement manuel d'un lot (facturation hors Stripe) : PENDING_PAYMENT → PAID. Idempotent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const { id } = await params;
  if (!BATCH_ID.test(id)) return NextResponse.json({ error: "Lot introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  if (!BodySchema.safeParse(body).success) return NextResponse.json({ error: "Statut invalide." }, { status: 422 });

  try {
    const updated = await prisma.leadBatch.updateMany({ where: { id, status: "PENDING_PAYMENT" }, data: { status: "PAID" } });
    if (updated.count === 1) return NextResponse.json({ ok: true, status: "PAID" });

    // Déjà payé, ou lot inconnu : on le dit sans rien modifier.
    const existing = await prisma.leadBatch.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Lot introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, status: existing.status });
  } catch (error) {
    console.error("[broker] encaissement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Encaissement impossible." }, { status: 500 });
  }
}
