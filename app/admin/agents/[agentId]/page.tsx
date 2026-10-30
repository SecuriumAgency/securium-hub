import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { AgentDetail } from "@/components/admin/AgentDetail";
import { AgentTabs, type TabItem } from "@/components/admin/AgentTabs";
import { AGENTS, findAgent } from "@/lib/agents/registry";
import { agentState } from "@/lib/agents/status";
import { readStoredReport, STALE_AFTER_MS } from "@/lib/telemetry-store";

// Lue à chaque visite, derrière la session admin (middleware.ts) : l'état de l'agent vient du rapport du poste.
export const dynamic = "force-dynamic";

// Fiche d'un agent. Un identifiant inconnu renvoie une 404, pas une fiche vide.
export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = findAgent(agentId);
  if (!agent) notFound();

  const stored = await readStoredReport();
  const report = stored?.report ?? null;
  const stale = stored ? Date.now() - Date.parse(stored.receivedAt) > STALE_AFTER_MS : false;

  const state = agentState(agent, report, stale);
  const tabs: TabItem[] = AGENTS.map((item) => {
    const itemState = agentState(item, report, stale);
    return { id: item.id, name: item.name, icon: item.icon, kind: item.kind, status: itemState.status };
  });

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <AgentTabs items={tabs} currentId={agent.id} />

        <AgentDetail agent={agent} state={state} configured={Boolean(process.env.GITHUB_ACTIONS_TOKEN)} />
      </div>
    </main>
  );
}
