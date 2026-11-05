import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ArtisanTargets, type ArtisanRow } from "@/components/admin/ArtisanTargets";
import { BrokerClients, type BrokerClient } from "@/components/admin/BrokerClients";
import { BrokerTable, type BrokerLead, type LeadBuyer } from "@/components/admin/BrokerTable";
import { evaluateMatch } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Lead Broker · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : le stock change à chaque vente.
export const dynamic = "force-dynamic";

export default async function BrokerPage() {
  // Acheteurs (artisans et clients) et leurs critères, puis leads disponibles et cessibles.
  const [buyerRows, leadRows] = await Promise.all([
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
  ]);

  // Seuls les acheteurs avec une niche et une zone peuvent recevoir un lead.
  const buyers = buyerRows.filter((buyer) => buyer.targetNiches.length > 0 && buyer.targetZipCodes.length > 0);

  // Matching visible : pour chaque lead, les acheteurs compatibles, meilleur score d'abord, clients avant artisans à score égal.
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

  const artisans: ArtisanRow[] = buyerRows;

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Lead Broker</p>
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Leads disponibles</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{rows.length}</span> lead{rows.length > 1 ? "s" : ""} à vendre, à l&apos;unité ou par lot.
          </p>
        </header>

        <BrokerClients clients={clients} />

        <BrokerTable leads={rows} />

        <ArtisanTargets artisans={artisans} />
      </div>
    </main>
  );
}
