import { NextResponse, type NextRequest } from "next/server";
import { RegisterRushSchema } from "@/lib/iafluencer-posts";
import { prisma } from "@/lib/prisma";

// Rushs déposés : liste (GET) et enregistrement après l'envoi vers Vercel Blob (POST). Session admin (middleware).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rushes = await prisma.rush.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fileName: true, url: true, sizeMb: true, createdAt: true },
    });
    return NextResponse.json({ rushes });
  } catch (error) {
    console.error("[rushes] lecture impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Lecture des rushs impossible." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = RegisterRushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Rush invalide." }, { status: 422 });
  }
  try {
    const rush = await prisma.rush.upsert({
      where: { url: parsed.data.url },
      create: parsed.data,
      update: {},
      select: { id: true, fileName: true, url: true, sizeMb: true, createdAt: true },
    });
    return NextResponse.json({ rush }, { status: 201 });
  } catch (error) {
    console.error("[rushes] enregistrement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement du rush impossible." }, { status: 500 });
  }
}
