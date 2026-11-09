"use client";

import { useEffect, useRef } from "react";
import { AgentsPanel } from "@/components/hub/AgentsPanel";
import { HubNav } from "@/components/hub/HubNav";
import { useTelemetryPolling } from "@/lib/use-telemetry";
import { useHubStore, type LogLevel } from "@/store/useHubStore";

// Barre latérale du NOC, posée à gauche par-dessus la ville 3D : télémétrie, agents, activité et liens vers les pages admin.
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

      {/* Agents : hauteur bornée, pour que le journal garde de la place. */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto">
        <AgentsPanel embedded />
      </div>

      <HubLogStream />

      <footer className="border-t border-slate-800/50 p-3">
        <HubNav />
      </footer>
    </aside>
  );
}

// Couleur par niveau : gris pour l'information, ambre pour l'avertissement, rose pour l'erreur.
const LEVEL_CLASS: Record<LogLevel, string> = {
  info: "text-slate-400",
  warn: "text-amber-400",
  error: "text-rose-400",
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Flux d'activité du hub : scans du réseau et connexions aux sites, les plus récents en bas.
// Le conteneur défile si l'historique s'allonge, et suit les nouvelles lignes.
function HubLogStream() {
  const logs = useHubStore((state) => state.systemLogs);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs.length]);

  return (
    <section aria-label="Journal d'activité" className="flex min-h-0 flex-1 flex-col border-t border-slate-800/50">
      <h2 className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Activité</h2>
      <div
        ref={list}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <p className="text-slate-500">En attente du premier scan…</p>
        ) : (
          logs.map((log) => (
            <p key={log.id} className={LEVEL_CLASS[log.level]}>
              <time dateTime={new Date(log.timestamp).toISOString()} className="text-slate-500">
                {formatTime(log.timestamp)}
              </time>{" "}
              {log.message}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
