import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Calendrier des publications : de la veille à trente jours. Session admin (middleware).
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  try {
    const posts = await prisma.socialPost.findMany({
      where: { scheduledAt: { gte: new Date(now - DAY), lte: new Date(now + 30 * DAY) } },
      orderBy: { scheduledAt: "asc" },
      take: 300,
      select: { id: true, platform: true, format: true, source: true, rushName: true, scheduledAt: true, status: true, error: true },
    });
    return NextResponse.json({ posts });
  } catch (error) {
    console.error("[posts] lecture impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Lecture du calendrier impossible." }, { status: 500 });
  }
}
