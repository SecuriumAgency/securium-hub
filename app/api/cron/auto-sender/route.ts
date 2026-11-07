import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { AUTO_SEND_LIMIT, runAutoSender } from "@/lib/auto-sender";

// Envoi automatique des brouillons de prescripteurs, lancé par Vercel Cron (vercel.json : lun–ven, 8h UTC, soit
// 9h ou 10h à Paris, dans la plage d'envoi). Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`.
// Désactivé tant que AUTO_SEND_ENABLED ne vaut pas « true » : la tâche répond sans rien envoyer.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }
  if (process.env.AUTO_SEND_ENABLED?.trim() !== "true") {
    return NextResponse.json({ skipped: "envoi automatique désactivé (AUTO_SEND_ENABLED)" });
  }

  try {
    const result = await runAutoSender({ now: new Date(), limit: AUTO_SEND_LIMIT, dryRun: false });
    return NextResponse.json(result);
  } catch (error) {
    // Seul le message sort dans les journaux : ni adresse, ni contenu de brouillon.
    console.error("[auto-sender] passage interrompu :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Passage interrompu." }, { status: 500 });
  }
}
