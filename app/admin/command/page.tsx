import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { CommandCenter } from "@/components/admin/CommandCenter";
import { LiveBadge, PageHeader } from "@/components/admin/PageHeader";
import { loadProspectionCounts } from "@/lib/prospection-counts";

export const metadata: Metadata = {
  title: "Batcave · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : les chiffres changent à chaque import.
export const dynamic = "force-dynamic";

// Centre de commandement : état des agents et serveurs (télémétrie côté client), prospection (base),
// raccourcis et workboard du jour.
export default async function CommandPage() {
  const counts = await loadProspectionCounts();

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <PageHeader
          eyebrow="Centre de commandement"
          title="Batcave"
          description="Les agents, les serveurs et la journée, en un coup d'œil."
          live={<LiveBadge label="Télémétrie en direct" />}
        />

        <CommandCenter summary={counts} />
      </div>
    </main>
  );
}
