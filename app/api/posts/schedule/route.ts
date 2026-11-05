import { NextResponse, type NextRequest } from "next/server";
import { checkScheduleWindow, parisToUtc, SchedulePostSchema } from "@/lib/iafluencer-posts";
import { prisma } from "@/lib/prisma";

// Planifie une publication sur un rush déjà envoyé. Statut PENDING : la route /api/cron/publish la traite
// à l'heure prévue. Une légende vide reste vide : elle sera générée une seule fois, à la publication.
// Session admin (middleware).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = SchedulePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Publication invalide." }, { status: 422 });
  }
  const input = parsed.data;

  if (input.format === "STORIES" && input.platform === "tiktok") {
    return NextResponse.json({ error: "Les Stories ne sont pas disponibles sur TikTok." }, { status: 422 });
  }

  const at = parisToUtc(input.date, input.time);
  const windowError = checkScheduleWindow(at, new Date());
  if (windowError) return NextResponse.json({ error: windowError }, { status: 422 });

  try {
    const rush = await prisma.rush.findUnique({ where: { id: input.rushId }, select: { fileName: true, url: true } });
    if (!rush) return NextResponse.json({ error: "Rush introuvable." }, { status: 404 });

    const post = await prisma.socialPost.create({
      data: {
        platform: input.platform,
        format: input.format,
        source: "USER",
        rushName: rush.fileName,
        mediaUrl: rush.url,
        caption: input.caption?.trim() ? input.caption.trim() : null,
        scheduledAt: at,
        status: "PENDING",
      },
      select: { id: true, scheduledAt: true, status: true },
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("[posts] planification impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Planification impossible." }, { status: 500 });
  }
}
