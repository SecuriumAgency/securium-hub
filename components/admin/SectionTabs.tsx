"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type SectionTab = { id: string; label: string; count?: number; content: ReactNode };

// Onglets d'une page admin. Chaque panneau est rendu par le serveur ; seul le choix change au clic, sans requête.
// Flèches, Début et Fin naviguent comme dans un menu WAI-ARIA. Le panneau s'anime à l'ouverture (mouvement réduit respecté).
export function SectionTabs({ label, tabs, initialId }: { label: string; tabs: SectionTab[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id ?? "");
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string, focus: boolean) => {
    setActive(id);
    if (focus) refs.current[id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next].id, true);
  };

  return (
    <div className="flex flex-col gap-5">
      <style>{"@keyframes sectionTabIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}</style>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              id={`${baseId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id, false)}
              onKeyDown={onKeyDown}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-primary md:px-4 ${
                selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-${tab.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-${tab.id}-tab`}
          hidden={tab.id !== active}
          className="motion-safe:[animation:sectionTabIn_0.35s_ease-out]"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
