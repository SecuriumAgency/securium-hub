import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { triggerWorkflow } from "@/lib/agents/triggers";
import { repairFor } from "@/lib/matrix/repairs";

// Réparation d'un site par l'agent Félix Fix, déclenchée depuis la scène 3D (pilote automatique ou action
// manuelle). Le navigateur n'envoie que `siteId` ; le workflow vient de la liste fixe de lib/matrix/repairs.ts.
// Session admin requise (le middleware la vérifie déjà, la route la revérifie).
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const siteId = typeof body === "object" && body !== null && "siteId" in body && typeof body.siteId === "string" ? body.siteId : "";

  const target = repairFor(siteId);
  if (!target) {
    return NextResponse.json({ error: "Aucune réparation automatique rattachée à ce site." }, { status: 404 });
  }

  const result = await triggerWorkflow(target.workflowId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ message: result.message, siteId });
}
