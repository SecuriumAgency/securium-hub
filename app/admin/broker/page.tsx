import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ArtisanTargets, type ArtisanRow } from "@/components/admin/ArtisanTargets";
import { BrokerClients, type BrokerClient } from "@/components/admin/BrokerClients";
import { BrokerGuide } from "@/components/admin/BrokerGuide";
import { BrokerSales, type SaleRow } from "@/components/admin/BrokerSales";
import { BrokerTable, type BrokerLead, type LeadBuyer } from "@/components/admin/BrokerTable";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { evaluateMatch } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Lead Broker · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : le stock change à chaque vente.
export const dynamic = "force-dynamic";

export default async function BrokerPage() {
  // Acheteurs (artisans et clients), leads disponibles et cessibles, et ventes déjà créées.
  const [buyerRows, leadRows, batchRows] = await Promise.all([
    prisma.outreachProspect.findMany({
      orderBy: { company: "asc" },
      take: 1000,
      select: { id: true, company: true, city: true, activity: true, targetNiches: true, targetZipCodes: true, isClient: true },
    }),
    prisma.capturedLead.findMany({
      where: { status: "AVAILABLE", consentToShare: true },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, phone: true, niche: true, region: true, postalCode: true, urgency: true, quality: true, suggestedPrice: true, createdAt: true },
    }),
    prisma.leadBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, totalPrice: true, status: true, createdAt: true, buyer: { select: { company: true } }, _count: { select: { leads: true } } },
    }),
  ]);

  // Seuls les acheteurs avec une niche et une zone peuvent recevoir un lead.
  const buyers = buyerRows.filter((buyer) => buyer.targetNiches.length > 0 && buyer.targetZipCodes.length > 0);

  // Matching : pour chaque lead, les acheteurs compatibles, meilleur score d'abord, clients avant artisans à score égal.
  const rows: BrokerLead[] = leadRows.map((lead) => {
    const matches: LeadBuyer[] = [];
    for (const buyer of buyers) {
      const result = evaluateMatch({ niche: lead.niche, postalCode: lead.postalCode, region: lead.region }, buyer);
      if (result.eligible) {
        matches.push({ id: buyer.id, company: buyer.company, isClient: buyer.isClient, score: result.score, label: result.label });
      }
    }
    matches.sort((a, b) => b.score - a.score || Number(b.isClient) - Number(a.isClient) || a.company.localeCompare(b.company));
    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      niche: lead.niche,
      region: lead.region,
      urgency: lead.urgency,
      quality: lead.quality,
      suggestedPrice: lead.suggestedPrice,
      createdAt: lead.createdAt.toISOString(),
      buyers: matches,
    };
  });

  const clients: BrokerClient[] = buyerRows
    .filter((buyer) => buyer.isClient)
    .map((client) => ({
      id: client.id,
      company: client.company,
      city: client.city,
      niches: client.targetNiches,
      zones: client.targetZipCodes,
      compatibleLeads: rows.filter((lead) => lead.buyers.some((buyer) => buyer.id === client.id)).length,
    }));

  // Vue inverse du matching, par acheteur : combien de leads disponibles lui correspondent, et le meilleur score.
  const stats = new Map<string, { count: number; best: number }>();
  for (const lead of rows) {
    for (const match of lead.buyers) {
      const current = stats.get(match.id) ?? { count: 0, best: 0 };
      stats.set(match.id, { count: current.count + 1, best: Math.max(current.best, match.score) });
    }
  }
  const artisans: ArtisanRow[] = buyerRows.map((buyer) => ({
    id: buyer.id,
    company: buyer.company,
    city: buyer.city,
    activity: buyer.activity,
    targetNiches: buyer.targetNiches,
    targetZipCodes: buyer.targetZipCodes,
    compatibleLeads: stats.get(buyer.id)?.count ?? 0,
    bestScore: stats.get(buyer.id)?.best ?? null,
  }));

  const sales: SaleRow[] = batchRows.map((batch) => ({
    id: batch.id,
    name: batch.name,
    totalPrice: batch.totalPrice,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    buyer: batch.buyer?.company ?? null,
    leadCount: batch._count.leads,
  }));

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Lead Broker</p>
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Vendre les leads consentis</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{rows.length}</span> lead{rows.length > 1 ? "s" : ""} disponible{rows.length > 1 ? "s" : ""},{" "}
            <span className="font-semibold tabular-nums text-foreground">{buyers.length}</span> acheteur{buyers.length > 1 ? "s" : ""} configuré{buyers.length > 1 ? "s" : ""}.
          </p>
        </header>

        <BrokerGuide />

        <SectionTabs
          label="Sections du Lead Broker"
          tabs={[
            {
              id: "leads",
              label: "Leads disponibles",
              count: rows.length,
              content: <BrokerTable leads={rows} />,
            },
            {
              id: "acheteurs",
              label: "Acheteurs et matching",
              count: buyerRows.length,
              content: (
                <div className="flex flex-col gap-6 md:gap-8">
                  <BrokerClients clients={clients} />
                  <ArtisanTargets artisans={artisans} />
                </div>
              ),
            },
            {
              id: "ventes",
              label: "Ventes",
              count: sales.length,
              content: <BrokerSales sales={sales} />,
            },
          ]}
        />
      </div>
    </main>
  );
}
