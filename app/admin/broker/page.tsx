import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { BrokerTable, type BrokerBuyer, type BrokerLead } from "@/components/admin/BrokerTable";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Lead Broker · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : le stock change à chaque vente.
export const dynamic = "force-dynamic";

export default async function BrokerPage() {
  const [leads, buyers] = await Promise.all([
    prisma.capturedLead.findMany({
      where: { status: "AVAILABLE", consentToShare: true },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, phone: true, niche: true, region: true, urgency: true, quality: true, suggestedPrice: true, createdAt: true },
    }),
    prisma.outreachProspect.findMany({
      orderBy: { company: "asc" },
      take: 1000,
      select: { id: true, company: true, city: true },
    }),
  ]);

  const rows: BrokerLead[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    niche: lead.niche,
    region: lead.region,
    urgency: lead.urgency,
    quality: lead.quality,
    suggestedPrice: lead.suggestedPrice,
    createdAt: lead.createdAt.toISOString(),
  }));
  const choices: BrokerBuyer[] = buyers;

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

        <BrokerTable leads={rows} buyers={choices} />
      </div>
    </main>
  );
}
