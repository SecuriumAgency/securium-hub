import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { FleetManager, type FleetRow } from "@/components/admin/FleetManager";
import { FleetRunNote } from "@/components/admin/ScheduledRuns";
import { FLEET_KEY, readSnapshot, type FleetSnapshot } from "@/lib/cron-store";
import { startOfMonth } from "@/lib/month";
import { prisma } from "@/lib/prisma";
import { formatNumber, initialSites } from "@/lib/sites";
import { fetchDeploymentStatus } from "@/lib/vercel";

export const metadata: Metadata = {
  title: "Parc Sites · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : statuts Vercel et leads changent sans cesse.
export const dynamic = "force-dynamic";

// Sites autorisés : ceux de lib/mock-data.json, via lib/sites.ts (les mêmes siteId que la réception des leads).
// Statut : le dernier déploiement de production du projet Vercel, lu seulement si VERCEL_API_TOKEN est défini ;
// un site sans projet Vercel garde son statut fixe.
export default async function FleetPage() {
  const token = process.env.VERCEL_API_TOKEN;
  const monthStart = startOfMonth(new Date());
  const scheduled = await readSnapshot<FleetSnapshot>(FLEET_KEY);
  const [statuses, totals, monthly] = await Promise.all([
    Promise.all(
      initialSites.map((site) => (site.vercelProject && token ? fetchDeploymentStatus(site.vercelProject, token) : site.status)),
    ),
    prisma.lead.groupBy({ by: ["siteId"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["siteId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
  ]);
  const totalBySite = new Map(totals.map((row) => [row.siteId, row._count._all]));
  const monthBySite = new Map(monthly.map((row) => [row.siteId, row._count._all]));

  const rows: FleetRow[] = initialSites.map((site, index) => ({
    site,
    status: statuses[index],
    leadsThisMonth: monthBySite.get(site.id) ?? 0,
    leadsTotal: totalBySite.get(site.id) ?? 0,
  }));
  const monthTotal = rows.reduce((sum, row) => sum + row.leadsThisMonth, 0);

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Parc Sites</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{rows.length}</span> sites ·{" "}
            <span className="font-semibold tabular-nums text-foreground">{formatNumber(monthTotal)}</span> leads ce mois
          </p>
          <FleetRunNote snapshot={scheduled} />
        </header>

        <FleetManager rows={rows} />
      </div>
    </main>
  );
}
