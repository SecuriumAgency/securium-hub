"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type OutreachView = "kanban" | "suivi";

// Vues de /admin/outreach, dans l'ordre des onglets. Le Kanban est la vue de travail, donc la première.
const VIEWS: { id: OutreachView; label: string; path: string }[] = [
  { id: "kanban", label: "Kanban interactif", path: "/admin/outreach" },
  { id: "suivi", label: "Suivi et brouillons", path: "/admin/outreach?vue=suivi" },
];

const tabClass = (selected: boolean) =>
  `flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary md:flex-none md:px-5 ${
    selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

// Deux vues dans une seule page. Les deux sont rendues par le serveur ; la vue non choisie reçoit `hidden`.
// La vue initiale vient de l'URL (?vue=suivi), donc le premier rendu du navigateur est celui du serveur :
// aucun décalage d'hydratation. Changer d'onglet ne refait aucune requête, et met l'URL à jour.
export function OutreachTabs({ initialView, kanban, suivi }: { initialView: OutreachView; kanban: ReactNode; suivi: ReactNode }) {
  const [view, setView] = useState<OutreachView>(initialView);
  const baseId = useId();
  const tabs = useRef<Record<OutreachView, HTMLButtonElement | null>>({ kanban: null, suivi: null });

  const select = (next: OutreachView, focus: boolean) => {
    setView(next);
    const path = VIEWS.find((item) => item.id === next)?.path ?? "/admin/outreach";
    window.history.replaceState(window.history.state, "", path);
    if (focus) tabs.current[next]?.focus();
  };

  // Motif des onglets WAI-ARIA : flèches pour passer d'un onglet à l'autre, Début et Fin pour les extrémités.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = VIEWS.findIndex((item) => item.id === view);
    const last = VIEWS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(VIEWS[next].id, true);
  };

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div role="tablist" aria-label="Vues de la prospection" className="flex gap-1 rounded-xl border border-border bg-card p-1 md:w-fit">
        {VIEWS.map(({ id, label }) => {
          const selected = view === id;
          return (
            <button
              key={id}
              ref={(node) => {
                tabs.current[id] = node;
              }}
              id={`${baseId}-${id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(id, false)}
              onKeyDown={onKeyDown}
              className={tabClass(selected)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-kanban-panel`} role="tabpanel" aria-labelledby={`${baseId}-kanban-tab`} hidden={view !== "kanban"}>
        <div className="flex flex-col gap-6 md:gap-8">{kanban}</div>
      </div>

      <div id={`${baseId}-suivi-panel`} role="tabpanel" aria-labelledby={`${baseId}-suivi-tab`} hidden={view !== "suivi"}>
        <div className="flex flex-col gap-6 md:gap-8">{suivi}</div>
      </div>
    </div>
  );
}
