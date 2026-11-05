import { NextResponse, type NextRequest } from "next/server";
import { CallStatusSchema } from "@/lib/warm-call";
import { prisma } from "@/lib/prisma";

// Suivi des appels du Warm Calling (tableau de /admin/outreach). Réservé à la session admin (middleware).
// Ne touche ni au statut du registre ni au Kanban : seule la colonne d'appel change.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = CallStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Statut d'appel invalide." }, { status: 422 });
  }

  try {
    await prisma.outreachProspect.update({
      where: { id: parsed.data.id },
      data: { callStatus: parsed.data.callStatus, callUpdatedAt: new Date() },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // P2025 : prospect introuvable (purgé entre-temps). Le message ne contient aucune donnée personnelle.
    const code = (error as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });
    console.error("[warm-call] mise à jour impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
