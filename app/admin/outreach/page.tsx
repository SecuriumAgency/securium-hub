import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AgentSettingsForm } from "@/components/admin/AgentSettingsForm";
import { DraftsPanel } from "@/components/admin/DraftsPanel";
import { KanbanBoard } from "@/components/admin/KanbanBoard";
import { ProspectHistory } from "@/components/admin/ProspectHistory";
import { SegmentDraftsPanel } from "@/components/admin/SegmentDraftsPanel";
import { DRAFT_STATUS } from "@/lib/chasseur";
import { MAX_KANBAN_LEADS } from "@/lib/kanban";
import { prisma } from "@/lib/prisma";
import { getKanbanLeads } from "./actions";

export const metadata: Metadata = {
  title: "Prospection · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : la table change à chaque import.
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;
// Heure de Paris imposée, comme le tableau des leads.
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });

// Statuts du registre de securium-prospector, et celui des brouillons du Chasseur. Les autres restent neutres.
const statusStyle: Record<string, string> = {
  Envoye: "border-primary/30 bg-primary/10 text-primary",
  Relance_1: "border-warning/30 bg-warning/10 text-warning",
  [DRAFT_STATUS]: "border-draft/30 bg-draft/10 text-draft",
};
const neutralStyle = "border-border bg-muted text-foreground";

// Lien d'action (mailto, tel) : zone tactile de 44 px au moins, texte long coupé.
const contactLink = "inline-flex min-h-[44px] max-w-full items-center truncate text-foreground transition-colors hover:text-primary";

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${statusStyle[status] ?? neutralStyle}`}>{status}</span>;
}

type Prospect = Awaited<ReturnType<typeof prisma.outreachProspect.findMany>>[number];

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`${contactLink} tabular-nums`}>
      {phone}
    </a>
  );
}

// Prospects démarchés (scripts/migrate-outreach.mts) et brouillons de l'agent Chasseur à valider.
// Mobile d'abord : cartes empilées, tableau à partir de md.
export default async function OutreachPage() {
  const [prospects, total, byStatus, leads] = await Promise.all([
    prisma.outreachProspect.findMany({ orderBy: { lastContactAt: "desc" }, take: MAX_ROWS }),
    prisma.outreachProspect.count(),
    prisma.outreachProspect.groupBy({ by: ["status"], _count: { _all: true } }),
    getKanbanLeads(),
  ]);
  const statuses = byStatus.sort((a, b) => b._count._all - a._count._all);

  return (
    <main className="min-h-dvh overflow-x-hidden bg-background text-foreground">
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

        <DraftsPanel />

        <KanbanBoard leads={leads} />
        {total > MAX_KANBAN_LEADS && (
          <p className="text-xs text-muted-foreground">
            {MAX_KANBAN_LEADS} prospects au Kanban sur {total}, du premier contact le plus récent au plus ancien.
          </p>
        )}

        <SegmentDraftsPanel />

        <AgentSettingsForm />

        <section aria-labelledby="prospects-title" className="flex flex-col gap-4">
          <h2 id="prospects-title" className="text-lg font-semibold text-foreground md:text-xl">
            Prospects démarchés
          </h2>

          {total === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground md:p-6">
              Aucun prospect importé. L&apos;historique s&apos;importe avec{" "}
              <span className="break-words font-mono text-foreground">node scripts/migrate-outreach.mts --send</span>.
            </p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card md:hidden">
                {prospects.map((prospect) => (
                  <ProspectItem key={prospect.id} prospect={prospect} />
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Prospects démarchés, du dernier contact le plus récent au plus ancien</caption>
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {["Premier contact", "Dernier contact", "Entreprise", "Email", "Téléphone", "Statut", "Source", "Échanges"].map((column) => (
                        <th key={column} scope="col" className="px-4 py-3 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prospects.map((prospect) => (
                      <tr key={prospect.id} className="transition-colors hover:bg-muted">
                        <td className="whitespace-nowrap px-4 tabular-nums text-foreground">{dateFormat.format(prospect.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 tabular-nums text-muted-foreground">{dateFormat.format(prospect.lastContactAt)}</td>
                        <td className="max-w-56 truncate px-4 font-medium text-foreground" title={prospect.company}>
                          {prospect.company}
                        </td>
                        <td className="max-w-56 px-4" title={prospect.email}>
                          <a href={`mailto:${prospect.email}`} className={contactLink}>
                            {prospect.email}
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-4">
                          <PhoneLink phone={prospect.phone} />
                        </td>
                        <td className="whitespace-nowrap px-4">
                          <StatusBadge status={prospect.status} />
                        </td>
                        <td className="max-w-40 truncate px-4 text-muted-foreground" title={prospect.source}>
                          {prospect.source}
                        </td>
                        <td className="px-4 py-2">
                          <ProspectHistory prospectId={prospect.id} company={prospect.company} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {total > MAX_ROWS && (
            <p className="text-xs text-muted-foreground">
              {MAX_ROWS} prospects affichés sur {total}, du contact le plus récent au plus ancien.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

// Carte d'un prospect, sur mobile : entreprise et statut, puis contacts et dates.
function ProspectItem({ prospect }: { prospect: Prospect }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-base font-medium text-foreground">{prospect.company}</h3>
        <StatusBadge status={prospect.status} />
      </div>
      <a href={`mailto:${prospect.email}`} className={contactLink} title={prospect.email}>
        {prospect.email}
      </a>
      <PhoneLink phone={prospect.phone} />
      <p className="text-xs text-muted-foreground">
        Premier contact {dateFormat.format(prospect.createdAt)} · dernier {dateFormat.format(prospect.lastContactAt)}
      </p>
      <div className="mt-2 flex">
        <ProspectHistory prospectId={prospect.id} company={prospect.company} />
      </div>
    </li>
  );
}
