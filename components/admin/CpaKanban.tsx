"use client";

import { useOptimistic, useTransition, type DragEvent } from "react";
import type { CpaRow } from "@/components/admin/CpaPipeline";
import { DEAL_LABELS, type DealStatus } from "@/lib/broker/cpa-constants";
import { KANBAN_COLUMNS, columnOf, euros, type KanbanColumnId } from "@/lib/broker/cpa-kpi";

// Pastille de chaque colonne : la couleur monte avec l'avancement, du transmis au payé.
const columnAccent: Record<KanbanColumnId, string> = {
  TRANSMIS: "bg-slate-400",
  DEVIS_EN_COURS: "bg-amber-400",
  SIGNE: "bg-emerald-400",
  COMMISSION_PAYEE: "bg-emerald-300",
};

type Move = { id: string; status: DealStatus };

// Pipeline CPA en colonnes. Chaque carte se glisse dans une autre colonne (souris, tactile) ou se change avec son menu
// (clavier, petits écrans). Le déplacement s'affiche aussitôt ; si l'enregistrement échoue, l'erreur s'affiche et la
// carte revient à l'étape enregistrée, puisque la valeur affichée est recalculée depuis la base.
export function CpaKanban({ rows, onMove }: { rows: CpaRow[]; onMove: (id: string, status: DealStatus) => Promise<void> }) {
  const [board, applyMove] = useOptimistic(rows, (current, move: Move) =>
    current.map((row) => (row.id === move.id ? { ...row, dealStatus: move.status } : row)),
  );
  const [, startTransition] = useTransition();

  // Un déplacement vers la colonne où la carte se trouve déjà ne fait rien (un chantier démarré reste « Signé »).
  function moveTo(row: CpaRow, column: KanbanColumnId) {
    const target = KANBAN_COLUMNS.find((item) => item.id === column);
    if (!target || columnOf(row.dealStatus) === column) return;
    const status = target.entry;
    startTransition(async () => {
      applyMove({ id: row.id, status });
      await onMove(row.id, status);
    });
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, id: string) {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDrop(event: DragEvent<HTMLElement>, column: KanbanColumnId) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const row = board.find((item) => item.id === id);
    if (row) moveTo(row, column);
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {KANBAN_COLUMNS.map((column) => {
        const cards = board.filter((row) => columnOf(row.dealStatus) === column.id);
        const total = cards.reduce((sum, row) => sum + (row.expectedCommission ?? 0), 0);
        return (
          <section
            key={column.id}
            aria-labelledby={`cpa-kanban-${column.id}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, column.id)}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/50 p-3"
          >
            <header className="flex flex-col gap-0.5">
              <h3 id={`cpa-kanban-${column.id}`} className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${columnAccent[column.id]}`} />
                <span className="min-w-0 flex-1 truncate">{column.label}</span>
                <span className="tabular-nums text-slate-400">{cards.length}</span>
              </h3>
              <p className="text-xs tabular-nums text-slate-400">{euros(total)} estimés</p>
            </header>

            {cards.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">Aucun lead à cette étape</p>
            ) : (
              <ul className="flex max-h-[28rem] flex-col gap-2.5 overflow-y-auto p-0.5">
                {cards.map((row) => (
                  <li
                    key={row.id}
                    draggable
                    onDragStart={(event) => onDragStart(event, row.id)}
                    className="flex min-w-0 cursor-grab flex-col gap-1 rounded-lg border border-white/10 bg-slate-900/80 p-3 transition-colors hover:border-amber-400/40 active:cursor-grabbing"
                  >
                    <p className="truncate text-sm font-medium text-white">{row.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {row.company ?? "Partenaire non renseigné"} · {row.niche.replace(/-/g, " ")}
                    </p>
                    <p className="text-xs tabular-nums text-slate-200">
                      {row.expectedCommission === null ? "Commission non estimée" : euros(row.expectedCommission)}
                    </p>
                    <p className="text-[11px] text-slate-500">{DEAL_LABELS[row.dealStatus ?? "TRANSMIS"]}</p>
                    <select
                      aria-label={`Colonne de ${row.name}`}
                      value={columnOf(row.dealStatus)}
                      onChange={(event) => moveTo(row, event.target.value as KanbanColumnId)}
                      className="mt-1 min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                    >
                      {KANBAN_COLUMNS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
