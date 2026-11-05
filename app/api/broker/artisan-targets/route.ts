import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeNicheList, normalizeZoneList } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

// Critères de l'artisan acheteur : niches (corps de métier) et zones (codes postaux ou départements).
// Ces critères décident des leads qu'il peut acheter. Session admin (middleware).
const TargetsSchema = z.object({
  artisanId: z.string().min(1).max(64),
  targetNiches: z.array(z.string().max(60)).max(20),
  targetZipCodes: z.array(z.string().max(10)).max(50),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = TargetsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Critères invalides." }, { status: 422 });

  const targetNiches = normalizeNicheList(parsed.data.targetNiches);
  const targetZipCodes = normalizeZoneList(parsed.data.targetZipCodes);
  if (targetNiches.length === 0 || targetZipCodes.length === 0) {
    return NextResponse.json({ error: "Au moins une niche et une zone sont requises." }, { status: 422 });
  }

  try {
    const artisan = await prisma.outreachProspect.update({
      where: { id: parsed.data.artisanId },
      data: { targetNiches, targetZipCodes },
      select: { id: true, targetNiches: true, targetZipCodes: true },
    });
    return NextResponse.json({ ok: true, artisan });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "Artisan introuvable." }, { status: 404 });
    console.error("[broker] critères impossibles à enregistrer :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
