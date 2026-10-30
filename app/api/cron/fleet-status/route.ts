import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { notifyAlert } from "@/lib/alerts";
import { FLEET_KEY, FLEET_TTL_S, readSnapshot, writeSnapshot, type FleetSnapshot } from "@/lib/cron-store";
import { initialSites } from "@/lib/sites";
import { fetchDeploymentStatus } from "@/lib/vercel";

// Relevé quotidien des statuts Vercel de la flotte (vercel.json). Vercel Cron envoie
// `Authorization: Bearer <CRON_SECRET>` ; la route vérifie la clé, le middleware laisse passer ce GET.
// Alerte Discord pour chaque site qui passe hors ligne depuis le relevé précédent.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return NextResponse.json({ error: "VERCEL_API_TOKEN n'est pas défini." }, { status: 503 });

  const previous = await readSnapshot<FleetSnapshot>(FLEET_KEY);
  const withProject = initialSites.flatMap((site) => (site.vercelProject ? [{ id: site.id, name: site.name, project: site.vercelProject }] : []));
  const sites = await Promise.all(
    withProject.map(async (site) => ({ id: site.id, name: site.name, status: await fetchDeploymentStatus(site.project, token) })),
  );

  const snapshot: FleetSnapshot = { checkedAt: new Date().toISOString(), sites };
  const wentDown = sites.filter(
    (site) => site.status === "offline" && previous?.sites.find((item) => item.id === site.id)?.status !== "offline",
  );
  for (const site of wentDown) {
    await notifyAlert(`Site hors ligne : ${site.name}`, "Le dernier déploiement de production est en erreur.");
  }
  await writeSnapshot(FLEET_KEY, snapshot, FLEET_TTL_S);

  return NextResponse.json({ checkedAt: snapshot.checkedAt, sites: sites.length, offline: wentDown.map((site) => site.id) });
}
