import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/api-key";
import { AGENT_FOR_TYPE, classify } from "@/lib/orchestrator/categorize";
import { prisma } from "@/lib/prisma";

// Webhook de l'Orchestrateur : reçoit un rapport (site en alerte, gravité, message) et crée une tâche
// d'optimisation (SEO, DEV, SECURITE, UI) dans AgentTask.
// Header attendu : `Authorization: Bearer <ORCHESTRATOR_TOKEN>`. Le middleware laisse passer ce POST sans
// cookie : le jeton est vérifié ici, en temps constant.
export const dynamic = "force-dynamic";

const ReportSchema = z.object({
  source: z.string().trim().min(1).max(64),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  const secret = process.env.ORCHESTRATOR_TOKEN?.trim();
  if (!secret) {
    console.error("[orchestrator] ORCHESTRATOR_TOKEN n'est pas défini : rapports refusés.");
    return NextResponse.json({ error: "Orchestrateur non configuré." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Jeton invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Rapport invalide." }, { status: 422 });

  const { source, severity, message } = parsed.data;
  const { type } = classify(message);
  try {
    const task = await prisma.agentTask.create({
      data: { site: source, type, severity, description: message, assignedAgent: AGENT_FOR_TYPE[type] },
      select: { id: true, type: true, assignedAgent: true },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("[orchestrator] tâche non créée :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Création de la tâche impossible." }, { status: 500 });
  }
}
