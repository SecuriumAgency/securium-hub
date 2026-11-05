import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { passGuard, runChasseurPass } from "@/lib/chasseur-run";

// Passage quotidien de l'agent Chasseur (vercel.json : lun–ven, 8h UTC soit 9h à Paris en hiver).
// Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`. Rédige des brouillons, n'envoie rien.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "claude-opus-5-5";
const BATCH_LIMIT = 5;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  const now = new Date();
  const guard = passGuard(now);
  if (!guard.run) return NextResponse.json({ skipped: guard.reason });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY n'est pas définie : agent non lancé." }, { status: 503 });
  }

  try {
    const result = await runChasseurPass({
      client: new Anthropic(),
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      now,
      limit: BATCH_LIMIT,
    });
    if (result.status === "blocked") {
      console.error(`[chasseur] passage bloqué : ${result.reason}`);
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    // Seul le message sort dans les journaux : ni adresse, ni contenu de brouillon.
    console.error("[chasseur] passage interrompu :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Passage interrompu." }, { status: 500 });
  }
}
