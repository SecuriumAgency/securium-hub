import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { isAuthorized } from "@/lib/api-key";
import { prisma } from "@/lib/prisma";

// Tâches en attente, les plus anciennes d'abord. Lue par le dashboard (session admin) et par les agents
// (`Authorization: Bearer <ORCHESTRATOR_TOKEN>`). Le middleware laisse passer la requête : l'accès est
// vérifié ici, avant toute lecture.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.ORCHESTRATOR_TOKEN?.trim() ?? "";
  const byAgent = secret !== "" && isAuthorized(request.headers.get("authorization"), secret);
  if (!byAgent && !(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin ou jeton requis." }, { status: 401 });
  }

  try {
    const tasks = await prisma.agentTask.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        site: true,
        type: true,
        severity: true,
        status: true,
        description: true,
        assignedAgent: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[tasks] lecture impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Lecture des tâches impossible." }, { status: 500 });
  }
}
