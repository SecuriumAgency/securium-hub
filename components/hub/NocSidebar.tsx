"use client";

import { AgentsPanel } from "@/components/hub/AgentsPanel";
import { HubNav } from "@/components/hub/HubNav";
import { useTelemetryPolling } from "@/lib/use-telemetry";

// Barre latérale du NOC, posée à gauche par-dessus la ville 3D : télémétrie, agents et liens vers les pages admin.
// Verre très opaque et flou : le texte reste lisible au-dessus des couleurs de la ville. Seule la barre reprend
// les événements de souris ; le reste de la couche les laisse passer à la scène.
export function NocSidebar() {
  useTelemetryPolling();

  return (
    <aside
      aria-label="Supervision du réseau"
      className="pointer-events-auto relative flex h-full w-80 max-w-[85vw] flex-none flex-col border-r border-slate-800/50 bg-slate-950/85 text-slate-100 shadow-2xl backdrop-blur-xl"
    >
      <header className="border-b border-slate-800/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Securium Hub 3D</p>
        <p className="text-sm font-semibold text-white">Centre des opérations réseau</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AgentsPanel embedded />
      </div>

      <footer className="border-t border-slate-800/50 p-3">
        <HubNav />
      </footer>
    </aside>
  );
}
