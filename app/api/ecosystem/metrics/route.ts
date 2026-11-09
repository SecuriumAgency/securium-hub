import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import type { EcosystemMetrics, TaskSeverity } from "@/lib/matrix/metrics";
import { startOfDay, startOfMonth } from "@/lib/month";
import { prisma } from "@/lib/prisma";

// Métriques de la scène 3D : leads des sites, leads captés par le broker et tâches de l'Orchestrateur.
// Compteurs uniquement, aucune donnée personnelle ne part vers le navigateur. Session admin requise.
export const dynamic = "force-dynamic";

const SEVERITIES: TaskSeverity[] = ["info", "warning", "critical"];

export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  try {
    const [leadsToday, leadsMonth, todayBySite, monthBySite, capturedToday, pendingBySeverity] = await Promise.all([
      prisma.lead.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.lead.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.lead.groupBy({ by: ["siteId"], where: { createdAt: { gte: dayStart } }, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["siteId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
      prisma.capturedLead.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.agentTask.groupBy({ by: ["severity"], where: { status: "PENDING" }, _count: { _all: true } }),
    ]);

    const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<TaskSeverity, number>;
    for (const row of pendingBySeverity) bySeverity[row.severity] = row._count._all;

    const body: EcosystemMetrics = {
      generatedAt: now.toISOString(),
      dayStart: dayStart.toISOString(),
      monthStart: monthStart.toISOString(),
      leads: {
        today: leadsToday,
        month: leadsMonth,
        todayBySite: Object.fromEntries(todayBySite.map((row) => [row.siteId, row._count._all])),
        monthBySite: Object.fromEntries(monthBySite.map((row) => [row.siteId, row._count._all])),
      },
      capturedLeads: { today: capturedToday },
      tasks: { pending: Object.values(bySeverity).reduce((sum, count) => sum + count, 0), bySeverity },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[ecosystem] métriques impossibles :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Base de données indisponible." }, { status: 503 });
  }
}
