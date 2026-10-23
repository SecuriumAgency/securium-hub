import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LeadsResponse } from "@/lib/leads";
import { startOfMonth } from "@/lib/month";
import { initialSites } from "@/lib/sites";

export async function GET() {
  const monthStart = startOfMonth(new Date());

  try {
    const [total, thisMonth] = await Promise.all([
      prisma.lead.groupBy({ by: ["siteId"], _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["siteId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
    ]);
    const count = (rows: typeof total, siteId: string) => rows.find((row) => row.siteId === siteId)?._count._all ?? 0;

    // Chaque site de la flotte figure dans la réponse, à 0 s'il n'a encore reçu aucun lead.
    const body: LeadsResponse = {
      monthStart: monthStart.toISOString(),
      metrics: Object.fromEntries(
        initialSites.map((site) => [
          site.id,
          { leadsThisMonth: count(thisMonth, site.id), leadsTotal: count(total, site.id) },
        ]),
      ),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[leads] lecture impossible :", error);
    return NextResponse.json({ error: "Base de leads indisponible." }, { status: 503 });
  }
}
