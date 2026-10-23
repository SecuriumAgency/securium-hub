import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LeadsResponse, SiteMetrics } from "@/lib/leads";
import { startOfMonth } from "@/lib/month";
import { initialSites } from "@/lib/sites";

export async function GET() {
  const monthStart = startOfMonth(new Date());

  try {
    // Historique complet, sans borne de date. Champs listés un à un : une colonne ajoutée plus tard
    // au modèle ne part pas vers le navigateur sans décision explicite.
    const rows = await prisma.lead.findMany({
      select: { id: true, siteId: true, name: true, phone: true, email: true, service: true, source: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    // Compteurs tirés de la même lecture que la liste : ils lui correspondent toujours. Chaque site
    // de la flotte figure dans la réponse, à 0 s'il n'a encore reçu aucun lead.
    const metrics: Record<string, SiteMetrics> = Object.fromEntries(
      initialSites.map((site) => [site.id, { leadsThisMonth: 0, leadsTotal: 0 }]),
    );
    for (const row of rows) {
      const site = metrics[row.siteId];
      if (!site) continue;
      site.leadsTotal++;
      if (row.createdAt >= monthStart) site.leadsThisMonth++;
    }

    const body: LeadsResponse = {
      monthStart: monthStart.toISOString(),
      metrics,
      leads: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[leads] lecture impossible :", error);
    return NextResponse.json({ error: "Base de leads indisponible." }, { status: 503 });
  }
}
