import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAutopilotPosts, publishDue } from "@/lib/iafluencer-engine";

// Publication planifiée de l'IAfluencer (vercel.json : chaque heure). Vercel Cron envoie
// `Authorization: Bearer <CRON_SECRET>`. Sans le bon jeton, rien n'est lancé.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Comparaison à temps constant de l'en-tête complet, avec le préfixe « Bearer ».
function matchesBearer(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!matchesBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Accès refusé : Jeton Cron invalide" }, { status: 401 });
  }

  const now = new Date();
  try {
    const autopilotCreated = await createAutopilotPosts(now);
    const summary = await publishDue(now);
    // Bilan chiffré uniquement : aucune légende, aucun lien de média, aucun jeton.
    return NextResponse.json({ autopilotCreated, ...summary });
  } catch (error) {
    console.error("[publish] passage interrompu :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Passage interrompu." }, { status: 500 });
  }
}
