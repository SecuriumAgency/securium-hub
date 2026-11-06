import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AgentSettingsForm } from "@/components/admin/AgentSettingsForm";
import { DraftsPanel } from "@/components/admin/DraftsPanel";
import { KanbanBoard } from "@/components/admin/KanbanBoard";
import { OutreachTabs, type OutreachView } from "@/components/admin/OutreachTabs";
import { ProspectorRunsPanel } from "@/components/admin/ProspectorRunsPanel";
import { ProspectRegistry, type RegistryRow } from "@/components/admin/ProspectRegistry";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { SegmentDraftsPanel } from "@/components/admin/SegmentDraftsPanel";
import { WarmCallTable, type WarmCallRow } from "@/components/core/WarmCallTable";
import { contactedProspectsWhere, DRAFT_STATUS } from "@/lib/chasseur";
import { MAX_KANBAN_LEADS } from "@/lib/kanban";
import { prisma } from "@/lib/prisma";
import { CALL_STATUSES, type CallStatus } from "@/lib/warm-call";
import { getKanbanLeads } from "./actions";

export const metadata: Metadata = {
  title: "Prospection · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : la table change à chaque import.
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

// Statuts du registre de securium-prospector, et celui des brouillons du Chasseur. Les autres restent neutres.
const statusStyle: Record<string, string> = {
  Envoye: "border-primary/30 bg-primary/10 text-primary",
  Relance_1: "border-warning/30 bg-warning/10 text-warning",
  [DRAFT_STATUS]: "border-draft/30 bg-draft/10 text-draft",
};
const neutralStyle = "border-border bg-muted text-foreground";

// Prospection : le Kanban d'abord, puis le suivi, découpé en onglets (live, closing, registre, réglages).
// Mobile d'abord : cartes empilées, tableau à partir de md.
export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue } = await searchParams;
  const initialView: OutreachView = vue === "suivi" ? "suivi" : "kanban";
  const [prospects, total, byStatus, leads, contacted] = await Promise.all([
    prisma.outreachProspect.findMany({ where: { isClient: false }, orderBy: { lastContactAt: "desc" }, take: MAX_ROWS }),
    prisma.outreachProspect.count({ where: { isClient: false } }),
    prisma.outreachProspect.groupBy({ by: ["status"], where: { isClient: false }, _count: { _all: true } }),
    getKanbanLeads(),
    // Pipeline de closing : prospects déjà contactés par email, du plus récent au plus ancien.
    prisma.outreachProspect.findMany({
      where: contactedProspectsWhere(),
      select: { id: true, company: true, phone: true, activity: true, targetNiches: true, targetZipCodes: true, lastContactAt: true, callStatus: true },
      orderBy: { lastContactAt: "desc" },
      take: 500,
    }),
  ]);
  const warmRows: WarmCallRow[] = contacted.map((prospect) => ({
    id: prospect.id,
    company: prospect.company,
    phone: prospect.phone,
    activity: prospect.activity,
    targetNiches: prospect.targetNiches,
    targetZipCodes: prospect.targetZipCodes,
    sentAt: prospect.lastContactAt.toISOString(),
    callStatus: prospect.callStatus !== null && prospect.callStatus in CALL_STATUSES ? (prospect.callStatus as CallStatus) : null,
  }));
  const registryRows: RegistryRow[] = prospects.map((prospect) => ({
    id: prospect.id,
    company: prospect.company,
    email: prospect.email,
    phone: prospect.phone,
    status: prospect.status,
    source: prospect.source,
    createdAt: prospect.createdAt.toISOString(),
    lastContactAt: prospect.lastContactAt.toISOString(),
  }));
  const statuses = byStatus.sort((a, b) => b._count._all - a._count._all);

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Prospection</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{total}</span> prospect{total > 1 ? "s" : ""}{" "}
              démarché{total > 1 ? "s" : ""}
            </p>
          </div>
          {statuses.length > 0 && (
            <ul aria-label="Prospects par statut" className="flex flex-wrap gap-2">
              {statuses.map(({ status, _count }) => (
                <li key={status} className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyle[status] ?? neutralStyle}`}>
                  {status} · <span className="tabular-nums">{_count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </header>

        <OutreachTabs
          initialView={initialView}
          kanban={
            <>
              <KanbanBoard leads={leads} />
              {total > MAX_KANBAN_LEADS && (
                <p className="text-xs text-muted-foreground">
                  {MAX_KANBAN_LEADS} prospects au Kanban sur {total}, du premier contact le plus récent au plus ancien.
                </p>
              )}
            </>
          }
          suivi={
            <SectionTabs
              label="Sections du suivi"
              tabs={[
                {
                  id: "live",
                  label: "Live et brouillons",
                  content: (
                    <div className="flex flex-col gap-6 md:gap-8">
                      <ProspectorRunsPanel />
                      <DraftsPanel />
                    </div>
                  ),
                },
                {
                  id: "closing",
                  label: "Closing",
                  count: warmRows.length,
                  content: (
                    <section aria-labelledby="warm-calling" className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <h2 id="warm-calling" className="text-lg font-semibold text-foreground">
                          Pipeline de closing (warm calling)
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {warmRows.length} prospect{warmRows.length > 1 ? "s" : ""} contacté{warmRows.length > 1 ? "s" : ""} par email, à rappeler au téléphone.
                        </p>
                      </div>
                      <WarmCallTable rows={warmRows} />
                    </section>
                  ),
                },
                {
                  id: "registre",
                  label: "Registre",
                  count: total,
                  content:
                    total === 0 ? (
                      <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground md:p-6">
                        Aucun prospect importé. L&apos;historique s&apos;importe avec{" "}
                        <span className="break-words font-mono text-foreground">node scripts/migrate-outreach.mts --send</span>.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <ProspectRegistry rows={registryRows} />
                        {total > MAX_ROWS && (
                          <p className="text-xs text-muted-foreground">
                            {MAX_ROWS} prospects affichés sur {total}, du contact le plus récent au plus ancien.
                          </p>
                        )}
                      </div>
                    ),
                },
                {
                  id: "reglages",
                  label: "Réglages",
                  content: (
                    <div className="flex flex-col gap-6 md:gap-8">
                      <SegmentDraftsPanel />
                      <AgentSettingsForm />
                    </div>
                  ),
                },
              ]}
            />
          }
        />
      </div>
    </main>
  );
}
