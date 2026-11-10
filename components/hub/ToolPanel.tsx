"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { CORE_TOOLS, type CoreTool } from "@/lib/coreToolsRegistry";
import type { ProspectionCounts } from "@/lib/prospection-counts";
import type { AgentStatus, PlanningSnapshot } from "@/lib/telemetry";
import { useTelemetry } from "@/lib/use-telemetry";
import { useHubStore } from "@/store/useHubStore";
import { useCoreResource, useCoreToolsStore } from "@/store/useCoreToolsStore";

// Panneau de l'outil actif : remplace la supervision générale tant qu'un outil est désigné (bâtiment de la ville ou ligne
// de la liste). Les données viennent des stores déjà alimentés (télémétrie, sites, demandes B2B) ou du cache partagé des
// routes (compteurs de prospection, rushs) : aucune requête n'est dupliquée. Sans outil actif, il ne rend rien.
export function ToolPanel() {
  const activeTool = useCoreToolsStore((state) => state.activeTool);
  const setActiveTool = useCoreToolsStore((state) => state.setActiveTool);
  const tool = CORE_TOOLS.find((item) => item.id === activeTool) ?? null;
  if (!tool) return null;
  // La clé remet le panneau à zéro à chaque changement d'outil.
  return <ToolBody key={tool.id} tool={tool} onClose={() => setActiveTool(null)} />;
}

function ToolBody({ tool, onClose }: { tool: CoreTool; onClose: () => void }) {
  return (
    <section
      aria-label={`Outil ${tool.label}`}
      className="flex min-h-0 flex-1 flex-col gap-3 border-t-2 px-4 pt-3 pb-4 text-slate-100"
      style={{ borderTopColor: tool.colorGlow }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: tool.colorGlow }}>
            {tool.category}
          </p>
          <h2 className="truncate text-sm font-semibold text-white">{tool.label}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'outil"
          className="inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto text-xs">
        <ToolData tool={tool} />
      </div>

      <Link
        href={tool.href}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        Ouvrir la page <ArrowUpRight aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}

// Un composant par vue : chaque vue appelle ses propres hooks, aucun hook n'est conditionnel.
function ToolData({ tool }: { tool: CoreTool }) {
  switch (tool.view) {
    case "telemetry":
      return <TelemetryView />;
    case "planning":
      return <PlanningView />;
    case "fleet":
      return <FleetView />;
    case "b2b":
      return <B2BView />;
    case "prospection":
      return <ProspectionView />;
    case "rushes":
      return <RushesView />;
    case "none":
      return <p className="text-slate-400">Aucun flux temps réel pour cet outil. Ouvrez sa page pour le travailler.</p>;
  }
}

function Skeleton() {
  return (
    <ul aria-busy="true" className="space-y-2.5">
      {[0, 1, 2].map((index) => (
        <li key={index} aria-hidden className="space-y-1.5">
          <div className="h-2.5 w-28 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
          <div className="h-2 w-full animate-pulse rounded bg-white/5 motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  );
}

function Row({ label, tone, children }: { label: string; tone?: string; children?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-slate-200">{label}</span>
      <span className={`shrink-0 font-medium ${tone ?? "text-slate-400"}`}>{children}</span>
    </li>
  );
}

const AGENT_LABEL: Record<AgentStatus, string> = { running: "En ligne", idle: "En veille", error: "En erreur", unknown: "Inconnu" };
const AGENT_TONE: Record<AgentStatus, string> = {
  running: "text-emerald-300",
  idle: "text-slate-400",
  error: "text-rose-300",
  unknown: "text-amber-300",
};

// Télémétrie : agents et serveurs, à partir du store de télémétrie déjà alimenté par la barre latérale.
function TelemetryView() {
  const { data, failed } = useTelemetry();
  if (!data) return failed ? <p className="text-amber-300">Télémétrie injoignable.</p> : <Skeleton />;
  const report = data.report;
  if (!report || data.stale) return <p className="text-amber-300">Pas de rapport frais du poste : les statuts ne sont pas connus.</p>;
  const online = report.pm2.processes.filter((process) => process.status === "online").length;
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {report.agents.map((agent) => (
          <Row key={agent.name} label={agent.name} tone={AGENT_TONE[agent.status]}>
            {AGENT_LABEL[agent.status]}
          </Row>
        ))}
      </ul>
      <p className="border-t border-white/10 pt-2 text-slate-400">
        Serveurs PM2 : {online} / {report.pm2.processes.length} en ligne
      </p>
    </div>
  );
}

// Planning : budget du jour et prochains passages des agents, tirés du planning transmis par le poste.
function PlanningView() {
  const { data, failed } = useTelemetry();
  if (!data) return failed ? <p className="text-amber-300">Télémétrie injoignable.</p> : <Skeleton />;
  const planning: PlanningSnapshot | null | undefined = data.stale ? null : data.report?.planning;
  if (!planning) return <p className="text-amber-300">Planning non transmis par le poste.</p>;
  return (
    <div className="space-y-3">
      <p className="text-slate-200">
        Budget du jour : <span className="font-medium text-white">{planning.spentTodayUsd.toFixed(2)} $</span> /{" "}
        {planning.dailyBudgetUsd.toFixed(2)} $
      </p>
      <ul className="space-y-1.5 border-t border-white/10 pt-2">
        {planning.nextRuns.slice(0, 5).map((run) => (
          <Row key={`${run.at}-${run.agent}`} label={run.agent}>
            {new Date(run.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Row>
        ))}
      </ul>
    </div>
  );
}

const SITE_TONE = { online: "text-emerald-300", offline: "text-rose-300", maintenance: "text-amber-300" } as const;
const SITE_LABEL = { online: "En ligne", offline: "Hors ligne", maintenance: "Maintenance" } as const;

// Parc Sites : statut des sites, tiré du store du hub (déjà alimenté au chargement).
function FleetView() {
  const sites = useHubStore((state) => state.sitesNetwork);
  const loading = useHubStore((state) => state.isLoading);
  if (sites.length === 0) return loading ? <Skeleton /> : <p className="text-amber-300">Statut des sites indisponible.</p>;
  return (
    <ul className="space-y-1.5">
      {sites.map((site) => (
        <Row key={site.id} label={site.name} tone={SITE_TONE[site.status]}>
          {SITE_LABEL[site.status]}
        </Row>
      ))}
    </ul>
  );
}

// Audit B2B : demandes de contact, tirées du store du hub.
function B2BView() {
  const prospects = useHubStore((state) => state.b2bProspects);
  if (prospects.length === 0) return <p className="text-slate-400">Aucune demande B2B.</p>;
  return (
    <ul className="space-y-2">
      {prospects.map((prospect) => (
        <li key={prospect.id} className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-white">{prospect.name}</span>
            <span className="shrink-0 text-amber-300">{prospect.status}</span>
          </div>
          <p className="truncate text-slate-400">
            {prospect.company} · {prospect.service}
          </p>
        </li>
      ))}
    </ul>
  );
}

// Prospection : compteurs, partagés avec la Batcave par le cache de ressources (une seule requête).
function ProspectionView() {
  const resource = useCoreResource("/api/prospection/stats", 30_000);
  if (!resource || (resource.status === "loading" && !resource.data)) return <Skeleton />;
  if (!resource.data) return <p className="text-amber-300">Compteurs indisponibles. Nouvel essai au prochain rafraîchissement.</p>;
  const counts = resource.data as ProspectionCounts;
  const figures = [
    { label: "En base", value: counts.prospects },
    { label: "Démarchés", value: counts.contacted },
    { label: "Relances", value: counts.followUps },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {figures.map((figure) => (
        <div key={figure.label} className="rounded-lg border border-white/10 bg-white/5 p-2">
          <dd className="text-base font-semibold tabular-nums text-white">{figure.value.toLocaleString("fr-FR")}</dd>
          <dt className="mt-0.5 text-[10px] text-slate-400">{figure.label}</dt>
        </div>
      ))}
    </dl>
  );
}

type Rush = { id: string; fileName: string; sizeMb: number; createdAt: string };

// Reels Studio : derniers rushs déposés, depuis /api/rushes (cache partagé).
function RushesView() {
  const resource = useCoreResource("/api/rushes", 60_000);
  if (!resource || (resource.status === "loading" && !resource.data)) return <Skeleton />;
  if (!resource.data) return <p className="text-amber-300">Rushs indisponibles. Nouvel essai au prochain rafraîchissement.</p>;
  const rushes = (resource.data as { rushes: Rush[] }).rushes;
  if (rushes.length === 0) return <p className="text-slate-400">Aucun rush déposé.</p>;
  return (
    <div className="space-y-2">
      <p className="text-slate-300">
        {rushes.length} rush{rushes.length > 1 ? "s" : ""} récent{rushes.length > 1 ? "s" : ""}
      </p>
      <ul className="space-y-1.5">
        {rushes.slice(0, 5).map((rush) => (
          <Row key={rush.id} label={rush.fileName}>
            {rush.sizeMb} Mo
          </Row>
        ))}
      </ul>
    </div>
  );
}
