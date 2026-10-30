import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AgentsControlRoom, type CockpitCard, type ProcessRow, type TelemetryRow } from "@/components/admin/AgentsControlRoom";
import type { TabItem } from "@/components/admin/AgentTabs";
import { AGENTS } from "@/lib/agents/registry";
import { agentState } from "@/lib/agents/status";
import { readStoredReport, STALE_AFTER_MS } from "@/lib/telemetry-store";

export const metadata: Metadata = {
  title: "Escadron Agents · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : le rapport du poste change toutes les 10 s.
export const dynamic = "force-dynamic";

// Heure de Paris imposée : le Hub et le poste ne sont pas dans le même fuseau d'affichage.
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "medium" });

export default async function AgentsPage() {
  const stored = await readStoredReport();
  const report = stored?.report ?? null;
  const stale = stored ? Date.now() - Date.parse(stored.receivedAt) > STALE_AFTER_MS : false;

  const cards: CockpitCard[] = AGENTS.map((agent) => ({ agent, state: agentState(agent, report, stale) }));
  const tabs: TabItem[] = cards.map(({ agent, state }) => ({
    id: agent.id,
    name: agent.name,
    icon: agent.icon,
    kind: agent.kind,
    status: state.status,
  }));
  const running = cards.filter((card) => card.state.status === "running").length;
  const failing = cards.filter((card) => card.state.status === "error").length;

  const processes: ProcessRow[] = (report?.pm2.processes ?? []).map((process) => ({
    name: process.name,
    status: process.status,
    restarts: process.restarts,
    upSince: process.upSince ? timeFormat.format(new Date(process.upSince)) : null,
  }));

  const telemetry: TelemetryRow = {
    receivedLabel: stored ? timeFormat.format(new Date(stored.receivedAt)) : null,
    stale,
    host: report?.host ?? null,
  };

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Escadron Agents</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{running}</span> en cours ·{" "}
            <span className="font-semibold tabular-nums text-foreground">{failing}</span> en erreur ·{" "}
            <span className="font-semibold tabular-nums text-foreground">{AGENTS.length}</span> agents au catalogue
          </p>
        </header>

        <AgentsControlRoom cards={cards} tabs={tabs} processes={processes} telemetry={telemetry} />
      </div>
    </main>
  );
}
