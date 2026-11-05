import { NextResponse, type NextRequest } from "next/server";
import { BrokerError, CreateBatchSchema, createLeadBatch } from "@/lib/broker/batch";

// Vente d'un lot de leads capturés à un artisan. Réservé à la session admin (middleware).
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = CreateBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vente invalide." }, { status: 422 });
  }
  try {
    const result = await createLeadBatch(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof BrokerError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[broker] vente impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Vente impossible." }, { status: 500 });
  }
}
