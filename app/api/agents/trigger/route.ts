import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { triggerWorkflow } from "@/lib/agents/triggers";

// Lance un workflow du cockpit (lib/agents/triggers.ts) pour un appelant qui a la clé d'intégration.
// Header attendu : `Authorization: Bearer <HUB_SECRET_KEY>`. Le middleware laisse passer ce POST sans
// cookie : la clé est vérifiée ici, comme pour /api/leads/inbound.
// Corps attendu : { "agentId": "geo-lighthouse" }. La liste des identifiants est dans WORKFLOW_TRIGGERS.
export async function POST(request: NextRequest) {
  const secret = process.env.HUB_SECRET_KEY;
  if (!secret) {
    console.error("[agents] HUB_SECRET_KEY n'est pas défini : déclenchements refusés.");
    return NextResponse.json({ error: "Déclenchement non configuré." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const agentId = typeof body === "object" && body !== null && "agentId" in body && typeof body.agentId === "string" ? body.agentId : "";

  const result = await triggerWorkflow(agentId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ message: result.message });
}
