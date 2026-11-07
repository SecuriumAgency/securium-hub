import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { MatchmakerCard } from "@/components/admin/MatchmakerCard";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { loadMatchmaker } from "@/lib/matchmaker-server";

export const metadata: Metadata = {
  title: "Matchmaker · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : les leads et les ventes changent en continu.
export const dynamic = "force-dynamic";

export default async function MatchmakerPage() {
  const { rows, focusId, leadCount } = await loadMatchmaker();
  const focusRow = focusId ? rows.find((row) => row.partner.id === focusId) : undefined;
  const withLeads = rows.filter((row) => row.leadCount > 0).length;

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Matchmaker</p>
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Trouver les leads de chaque partenaire</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{rows.length}</span> partenaire{rows.length > 1 ? "s" : ""} actif{rows.length > 1 ? "s" : ""},{" "}
            <span className="font-semibold tabular-nums text-foreground">{withLeads}</span> avec un lead compatible,{" "}
            <span className="font-semibold tabular-nums text-foreground">{leadCount}</span> lead{leadCount > 1 ? "s" : ""} consenti{leadCount > 1 ? "s" : ""} disponible{leadCount > 1 ? "s" : ""}.
          </p>
        </header>

        <SectionTabs
          label="Vues du Matchmaker"
          tabs={[
            {
              id: "global",
              label: "Vue Globale",
              count: rows.length,
              content:
                rows.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
                    Aucun partenaire actif. Un partenaire doit avoir au moins une niche et une zone, dans le Lead Broker.
                  </p>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {rows.map((row) => (
                      <li key={row.partner.id} className="flex">
                        <div className="flex w-full">
                          <MatchmakerCard row={row} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              id: "focus",
              label: "Focus Géo Energie Habitat",
              content: focusRow ? (
                <div className="mx-auto w-full max-w-xl">
                  <MatchmakerCard row={focusRow} />
                </div>
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
                  Géo Energy Habitat n&apos;est pas actif : il doit avoir une niche et une zone, configurées dans le Lead Broker.
                </p>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
