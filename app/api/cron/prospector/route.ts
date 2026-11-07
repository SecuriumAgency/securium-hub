import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { runProspector } from "@/lib/auto-prospector-run";

// Lead Prospector, lancé par Vercel Cron (vercel.json : lun–ven, 2h UTC). Ajoute les prescripteurs trouvés sur
// OpenStreetMap au statut Nouveau. N'envoie rien : le Chasseur rédige ensuite un brouillon, à valider.
// Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Sites visités pour un e-mail, par passage : la durée d'une fonction est bornée.
const SITE_LIMIT = 10;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  try {
    const run = await runProspector({ source: "overpass", siteLimit: SITE_LIMIT, apply: true });
    // Compteurs seulement : la réponse ne contient ni adresse ni nom d'entreprise.
    return NextResponse.json({
      found: run.found,
      screened: run.screened,
      rejectedMetier: run.rejectedMetier,
      visited: run.visited,
      foundOnSite: run.foundOnSite,
      withoutEmail: run.withoutEmail,
      rejected: run.plan.rejections.length,
      written: run.written,
    });
  } catch (error) {
    // Seul le message sort dans les journaux.
    console.error("[prospector] passage interrompu :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Passage interrompu." }, { status: 500 });
  }
}
