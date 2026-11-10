"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentsPanel } from "@/components/hub/AgentsPanel";
import { HubNav } from "@/components/hub/HubNav";
import { ToolPanel } from "@/components/hub/ToolPanel";
import { GRID_MAP, PROSPECT_BUILDING_ID } from "@/components/3d/hubGrid";
import { formatAgo, useNow } from "@/lib/clock";
import { CORE_TOOLS } from "@/lib/coreToolsMapping";
import { useTelemetryPolling } from "@/lib/use-telemetry";
import { buildingLabel, useB2BPolling, useHubStore, useLeadsPolling, type LogLevel, type SiteStatus } from "@/store/useHubStore";

// Barre latérale du NOC, posée à gauche par-dessus la ville 3D : télémétrie, agents, sites, activité et liens vers les
// pages admin. Verre très opaque et flou : le texte reste lisible au-dessus des couleurs de la ville. Seule la barre
// reprend les événements de souris ; le reste de la couche les laisse passer à la scène.
export function NocSidebar() {
  useTelemetryPolling();
  useLeadsPolling();
  useB2BPolling();
  const activeTool = useHubStore((state) => state.activeTool);

  return (
    <aside
      aria-label="Supervision du réseau"
      className="pointer-events-auto relative flex h-full w-80 max-w-[85vw] flex-none flex-col border-r border-slate-800/50 bg-slate-950/85 text-slate-100 shadow-2xl backdrop-blur-xl"
    >
      <header className="border-b border-slate-800/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Securium Hub 3D</p>
        <p className="text-sm font-semibold text-white">{activeTool ? "Outil du Securium Core" : "Centre des opérations réseau"}</p>
      </header>

      {/* Haut de barre : la supervision générale, ou l'outil désigné dans la ville ou dans la liste. Hauteur bornée. */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto">{activeTool ? <ToolPanel /> : <AgentsPanel embedded />}</div>

      <HubSiteList />
      {!activeTool && <B2BSection />}
      <NodeTelemetry />
      <HubLogStream />

      <footer className="border-t border-slate-800/50 p-3">
        <HubNav />
      </footer>
    </aside>
  );
}

// Nœuds du plan : chaque bâtiment et la boutique, puis les bâtiments du quartier du QG (outils du Securium Core).
const PLAN_NODES: { id: string; label: string; href: string }[] = [
  ...GRID_MAP.buildings.map((building) => ({ id: building.id, label: building.label, href: building.href })),
  { id: GRID_MAP.shopSite.id, label: GRID_MAP.shopSite.label, href: GRID_MAP.shopSite.href },
  ...CORE_TOOLS.filter((tool) => tool.placement === "district").map((tool) => ({ id: tool.nodeId, label: tool.label, href: tool.href })),
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
  const unseenLeads = useHubStore((state) => state.unseenLeads);
  const leadsFailed = useHubStore((state) => state.leadsFailed);
  // Nombre (et non tableau) : un sélecteur qui crée un tableau relancerait le rendu à chaque mise à jour du store.
  const b2bToAudit = useHubStore((state) =>
    state.b2bProspects.reduce((count, item) => (item.status === "À auditer" ? count + 1 : count), 0),
  );

  const handleClick = (node: { id: string; href: string }) => {
    if (selectedNode === node.id) router.push(node.href);
    else selectNode(node.id);
  };

  return (
    <section aria-label="Sites du réseau" className="max-h-[30%] shrink-0 overflow-y-auto border-t border-slate-800/50 px-2 py-2">
      <h2 className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Sites
        {leadsFailed && <span className="font-normal normal-case tracking-normal text-amber-300">Leads : synchro en échec</span>}
      </h2>
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
                {node.id === PROSPECT_BUILDING_ID && b2bToAudit > 0 && (
                  <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] font-semibold text-amber-200">{b2bToAudit} à auditer</span>
                )}
                {node.id === PROSPECT_BUILDING_ID && unseenLeads > 0 && (
                  <span className="rounded-full bg-violet-400/20 px-1.5 text-[10px] font-semibold text-violet-200">
                    {unseenLeads} nouveau{unseenLeads > 1 ? "x" : ""}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  {site ? NODE_LABEL[site.status] : (CORE_TOOLS.find((tool) => tool.nodeId === node.id)?.category ?? "Statut indisponible")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Demandes de contact B2B : chaque demande reste ambre tant qu'elle attend un audit, et ouvre le moteur d'audit.
function B2BSection() {
  const prospects = useHubStore((state) => state.b2bProspects);
  const now = useNow(60_000);

  return (
    <section aria-label="Prospects et audits B2B" className="max-h-[25%] shrink-0 overflow-y-auto border-t border-slate-800/50 px-4 py-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Prospects &amp; Audits B2B</h2>
      {prospects.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Aucune demande B2B.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {prospects.map((prospect) => (
            <li key={prospect.id} className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-white">{prospect.name}</span>
                <span className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {prospect.status}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {prospect.company} · {prospect.service} · {formatAgo(prospect.receivedAt, now)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/admin/audit"
        className="mt-2 inline-flex min-h-9 items-center text-xs font-medium text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        Ouvrir le moteur d&apos;audit →
      </Link>
    </section>
  );
}

// Télémétrie du nœud sélectionné, dans la barre comme dans la ville : statut du site, et pour le bâtiment de prospection
// les derniers leads (nom, service, site, ancienneté). Le téléphone et l'e-mail ne sont pas affichés.
function NodeTelemetry() {
  const selectedNode = useHubStore((state) => state.selectedNode);
  const site = useHubStore((state) => state.sitesNetwork.find((item) => item.id === state.selectedNode));
  const leads = useHubStore((state) => state.leads);
  const now = useNow(15_000);
  const label = buildingLabel(selectedNode);
  if (!selectedNode || !label) return null;
  const recent = selectedNode === PROSPECT_BUILDING_ID ? leads.slice(0, 3) : [];

  return (
    <section aria-label="Télémétrie du nœud" className="shrink-0 border-t border-slate-800/50 px-4 py-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Nœud sélectionné</h2>
      <p className="mt-1 text-xs font-medium text-white">{label}</p>
      <p className="text-[11px] text-slate-400">{site ? `${site.name} · ${NODE_LABEL[site.status]}` : "Statut indisponible"}</p>
      {selectedNode === PROSPECT_BUILDING_ID && (
        <ul className="mt-2 space-y-1.5 font-mono text-[11px]">
          {recent.length === 0 ? (
            <li className="text-slate-500">Aucun lead reçu.</li>
          ) : (
            recent.map((lead) => (
              <li key={lead.id} className="truncate text-slate-300">
                {lead.name} · {lead.service}{" "}
                <span className="text-slate-500">
                  · {lead.siteName} · {formatAgo(lead.createdAt, now)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
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
