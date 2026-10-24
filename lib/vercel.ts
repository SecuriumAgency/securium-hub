import type { SiteStatus } from "./sites";

const DEPLOYMENTS_API = "https://api.vercel.com/v7/deployments";
const TIMEOUT_MS = 8000;

type DeploymentList = { deployments: { readyState: string }[] };

// Statut du dernier déploiement de production terminé d'un projet Vercel (GET /api/fleet, rapport
// quotidien). Le filtre READY,ERROR écarte les builds en cours ou annulés : ils ne disent rien de
// l'état du site. VERCEL_TEAM_ID facultatif.
export async function fetchDeploymentStatus(projectId: string, token: string): Promise<SiteStatus> {
  const url = new URL(DEPLOYMENTS_API);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("target", "production");
  url.searchParams.set("state", "READY,ERROR");
  url.searchParams.set("limit", "1");
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[fleet] ${projectId} : API Vercel ${response.status}`);
      return "unknown";
    }
    const { deployments } = (await response.json()) as DeploymentList;
    const state = deployments[0]?.readyState;
    if (state === "READY") return "online";
    if (state === "ERROR") return "offline";
    return "unknown";
  } catch (error) {
    console.error(`[fleet] ${projectId} :`, error);
    return "unknown";
  }
}
