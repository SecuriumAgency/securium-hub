"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AgentsPanel } from "@/components/hub/AgentsPanel";
import { HubNav } from "@/components/hub/HubNav";
import { GRID_MAP } from "@/components/3d/hubGrid";
import { useTelemetryPolling } from "@/lib/use-telemetry";
import { useHubStore, type LogLevel, type SiteStatus } from "@/store/useHubStore";

// Barre latérale du NOC, posée à gauche par-dessus la ville 3D : télémétrie, agents, sites, activité et liens vers les
// pages admin. Verre très opaque et flou : le texte reste lisible au-dessus des couleurs de la ville. Seule la barre
// reprend les événements de souris ; le reste de la couche les laisse passer à la scène.
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

      {/* Agents : hauteur bornée, pour que les sites et le journal gardent de la place. */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto">
        <AgentsPanel embedded />
      </div>

      <HubSiteList />
      <HubLogStream />

      <footer className="border-t border-slate-800/50 p-3">
        <HubNav />
      </footer>
    </aside>
  );
}

// Nœuds du plan : chaque bâtiment et la boutique, dans l'ordre du plan.
const PLAN_NODES: { id: string; label: string; href: string }[] = [
  ...GRID_MAP.buildings.map((building) => ({ id: building.id, label: building.label, href: building.href })),
  { id: GRID_MAP.shopSite.id, label: GRID_MAP.shopSite.label, href: GRID_MAP.shopSite.href },
];

const NODE_DOT: Record<SiteStatus, string> = { online: "bg-green-500", maintenance: "bg-amber-500", offline: "bg-red-500" };
const NODE_LABEL: Record<SiteStatus, string> = { online: "En ligne", maintenance: "Maintenance", offline: "Hors ligne" };

// Liste des bâtiments, liée à la ville 3D. Un clic sélectionne : la caméra s'approche et le bâtiment est surligné.
// Un second clic sur le même nœud ouvre sa page admin. Le clic sur un bâtiment de la ville suit la même logique.
function HubSiteList() {
  const router = useRouter();
  const sites = useHubStore((state) => state.sitesNetwork);
  const selectedNode = useHubStore((state) => state.selectedNode);
  const selectNode = useHubStore((state) => state.selectNode);

  const handleClick = (node: { id: string; href: string }) => {
    if (selectedNode === node.id) router.push(node.href);
    else selectNode(node.id);
  };

  return (
    <section aria-label="Sites du réseau" className="max-h-[30%] shrink-0 overflow-y-auto border-t border-slate-800/50 px-2 py-2">
      <h2 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Sites</h2>
      <ul className="space-y-0.5">
        {PLAN_NODES.map((node) => {
          const site = sites.find((item) => item.id === node.id);
          const selected = selectedNode === node.id;
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => handleClick(node)}
                aria-pressed={selected}
                className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                  selected ? "bg-cyan-400/10 text-white ring-1 ring-cyan-300/40" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${site ? NODE_DOT[site.status] : "bg-slate-600"}`} />
                <span className="flex-1 truncate">{node.label}</span>
                <span className="text-[11px] text-slate-400">{site ? NODE_LABEL[site.status] : "Statut indisponible"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
