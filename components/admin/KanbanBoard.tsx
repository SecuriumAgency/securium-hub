"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { updateLeadStatus, type KanbanLead } from "@/app/admin/outreach/actions";
import type { PipelineStatus } from "@/lib/generated/prisma/enums";
import { PIPELINE_COLUMNS } from "@/lib/kanban";

// Pastille de chaque colonne.
const columnAccent: Record<PipelineStatus, string> = {
  NOUVEAU: "bg-muted-foreground",
  ICEBREAKER_GENERE: "bg-draft",
  EMAIL_1_ENVOYE: "bg-primary",
  RELANCE_1: "bg-warning",
  REPONDU: "bg-success",
  REFUS: "bg-destructive",
};

type Move = { id: string; status: PipelineStatus };

// Pipeline des prospects B2B, une colonne par statut, sur les tons sombres du Hub. Mobile d'abord :
// colonnes empilées, puis côte à côte à partir de md, avec défilement horizontal, six ne tenant pas dans la
// largeur du panneau. Un déplacement s'affiche aussitôt ; s'il échoue, la carte revient d'elle-même dans sa
// colonne et l'erreur s'affiche.
export function KanbanBoard({ leads }: { leads: KanbanLead[] }) {
  const [board, applyMove] = useOptimistic(leads, (current, move: Move) =>
    current.map((lead) => (lead.id === move.id ? { ...lead, pipelineStatus: move.status } : lead)),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Menus inactifs jusqu'à l'hydratation : un changement fait avant se perd sans erreur, et le menu
  // afficherait un statut que la carte et la base n'ont pas.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const move =(lead: KanbanLead, status: PipelineStatus) => {
    setError(null);
    startTransition(async () => {
      applyMove({ id: lead.id, status });
      try {
        const result = await updateLeadStatus(lead.id, status);
        if (!result.ok) setError(`${lead.company} : ${result.error}`);
      } catch {
        // Réponse illisible, le plus souvent une session expirée : le middleware renvoie vers /login.
        setError(`${lead.company} : déplacement impossible. Rechargez la page, puis réessayez.`);
      }
    });
  };

  return (
    <section
      aria-labelledby="kanban-title"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-foreground md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="kanban-title" className="text-lg font-semibold md:text-xl">
          Pipeline de prospection
        </h2>
        <p className="text-sm text-muted-foreground">Le menu de chaque carte déplace le prospect dans une autre colonne.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4 md:snap-x md:flex-row md:overflow-x-auto md:pb-2">
        {PIPELINE_COLUMNS.map(({ status, label }) => {
          const cards = board.filter((lead) => lead.pipelineStatus === status);
          return (
            <section
              key={status}
              aria-labelledby={`kanban-${status}`}
              className="flex flex-col gap-3 rounded-lg bg-muted p-3 md:w-64 md:shrink-0 md:snap-start"
            >
              <h3 id={`kanban-${status}`} className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${columnAccent[status]}`} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="tabular-nums text-muted-foreground">{cards.length}</span>
              </h3>
              {cards.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Aucun prospect</p>
              ) : (
                <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto p-0.5 md:max-h-[32rem]">
                  {cards.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} disabled={!hydrated} onMove={(next) => move(lead, next)} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

// Carte d'un prospect : le registre ne connaît que l'entreprise et son adresse, pas de nom de contact.
function LeadCard({ lead, disabled, onMove }: { lead: KanbanLead; disabled: boolean; onMove: (status: PipelineStatus) => void }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <h4 className="break-words text-sm font-medium text-foreground">{lead.company}</h4>
      <a href={`mailto:${lead.email}`} title={lead.email} className="flex min-h-[44px] items-center text-xs text-muted-foreground transition-colors hover:text-primary">
        <span className="truncate">{lead.email}</span>
      </a>
      <select
        aria-label={`Statut de ${lead.company}`}
        value={lead.pipelineStatus}
        disabled={disabled}
        onChange={(event) => onMove(event.target.value as PipelineStatus)}
        className="min-h-[44px] w-full cursor-pointer rounded-lg border border-border bg-card px-2 text-sm text-foreground transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait"
      >
        {PIPELINE_COLUMNS.map(({ status, label }) => (
          <option key={status} value={status}>
            {label}
          </option>
        ))}
      </select>
    </li>
  );
}
