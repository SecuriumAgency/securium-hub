import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { INTEGRATION_MODULES, type IntegrationModule } from "@/lib/integrations/modules";
import { moduleUrl, NO_STORE, unauthorized } from "@/lib/integrations/bridge";

// État des neuf modules, pour la grille de /admin/ecosystem. Un module est « en ligne » s'il répond sans erreur serveur :
// une réponse 401 ou 404 au HEAD prouve qu'il tourne. Le contenu de sa réponse n'est jamais lu.
export const dynamic = "force-dynamic";

const PING_TIMEOUT_MS = 3000;

type ModuleStatus = { id: string; configured: boolean; online: boolean | null; latencyMs: number | null };

async function ping(module: IntegrationModule): Promise<ModuleStatus> {
  const url = moduleUrl(module.prefix);
  if (!url) return { id: module.id, configured: false, online: null, latencyMs: null };

  const started = performance.now();
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    await response.body?.cancel();
    return { id: module.id, configured: true, online: response.status < 500, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { id: module.id, configured: true, online: false, latencyMs: null };
  }
}

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const modules = await Promise.all(INTEGRATION_MODULES.map(ping));
  return NextResponse.json({ modules, checkedAt: new Date().toISOString() }, { headers: NO_STORE });
}
