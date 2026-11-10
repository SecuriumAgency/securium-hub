"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { B2BProspectsResponse } from "@/lib/b2b/types";
import { CORE_TOOLS, type CoreTool, type ToolView } from "@/lib/coreToolsMapping";
import type { ProspectionCounts } from "@/lib/prospection-counts";
import { startPolling } from "@/lib/poll";
import type { AgentStatus, TelemetryResponse } from "@/lib/telemetry";
import { useHubStore } from "@/store/useHubStore";

// Rythme de rafraîchissement par flux. La flotte interroge Vercel site par site : elle reste plus lente.
const INTERVAL_MS: Record<ToolView, number> = { telemetry: 15_000, fleet: 60_000, b2b: 60_000, prospection: 30_000, none: 0 };

type FleetResponse = { sites: { id: string; name: string; status: "online" | "offline" | "unknown" }[]; updatedAt: string };
type LoadState = { status: "loading" | "ready" | "error"; body: unknown };

const AGENT_LABEL: Record<AgentStatus, string> = { running: "En ligne", idle: "En veille", error: "En erreur", unknown: "Inconnu" };
const AGENT_TONE: Record<AgentStatus, string> = {
  running: "text-emerald-300",
  idle: "text-slate-400",
  error: "text-rose-300",
  unknown: "text-amber-300",
};
const SITE_TONE = { online: "text-emerald-300", offline: "text-rose-300", unknown: "text-amber-300" } as const;
const SITE_LABEL = { online: "En ligne", offline: "Hors ligne", unknown: "À vérifier" } as const;

// Panneau de l'outil actif : remplace la supervision générale tant qu'un outil est désigné (bâtiment ou ligne de la liste).
// Rendu sous forme de bloc ; sans outil actif, il ne rend rien.
export function ToolPanel() {
  const activeTool = useHubStore((state) => state.activeTool);
  const setActiveTool = useHubStore((state) => state.setActiveTool);
  const tool = CORE_TOOLS.find((item) => item.id === activeTool) ?? null;
  if (!tool) return null;
  // La clé remet l'état à zéro quand on change d'outil : pas de donnée de l'outil précédent qui reste affichée.
  return <ToolBody key={tool.id} tool={tool} onClose={() => setActiveTool(null)} />;
}

function ToolBody({ tool, onClose }: { tool: CoreTool; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: tool.apiEndpoint ? "loading" : "ready", body: null });

  useEffect(() => {
    if (!tool.apiEndpoint) return;
    return startPolling<unknown>(
      tool.apiEndpoint,
      INTERVAL_MS[tool.view],
      (body) => setState({ status: "ready", body }),
      () => setState((previous) => ({ ...previous, status: "error" })),
    );
  }, [tool.apiEndpoint, tool.view]);

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
        <ToolData tool={tool} state={state} />
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

// Corps de l'outil : squelette pendant le premier chargement, puis les données réelles de sa route.
function ToolData({ tool, state }: { tool: CoreTool; state: LoadState }) {
  if (tool.view === "none") {
    return <p className="text-slate-400">Aucun flux temps réel pour cet outil. Ouvrez sa page pour le travailler.</p>;
  }
  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") {
    return <p className="text-amber-300">Flux indisponible. Nouvel essai au prochain rafraîchissement.</p>;
  }

  switch (tool.view) {
    case "telemetry":
      return <TelemetryView body={state.body as TelemetryResponse} />;
    case "fleet":
      return <FleetView body={state.body as FleetResponse} />;
    case "b2b":
      return <B2BView body={state.body as B2BProspectsResponse} />;
    case "prospection":
      return <ProspectionView body={state.body as ProspectionCounts} />;
    default:
      return null;
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

function TelemetryView({ body }: { body: TelemetryResponse }) {
  const report = body.report;
  if (!report || body.stale) {
    return <p className="text-amber-300">Pas de rapport frais du poste : les statuts ne sont pas connus.</p>;
  }
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

function FleetView({ body }: { body: FleetResponse }) {
  return (
    <ul className="space-y-1.5">
      {body.sites.map((site) => (
        <Row key={site.id} label={site.name} tone={SITE_TONE[site.status]}>
          {SITE_LABEL[site.status]}
        </Row>
      ))}
    </ul>
  );
}

function B2BView({ body }: { body: B2BProspectsResponse }) {
  if (body.prospects.length === 0) return <p className="text-slate-400">Aucune demande B2B.</p>;
  return (
    <ul className="space-y-2">
      {body.prospects.map((prospect) => (
        <li key={prospect.id} className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-white">{prospect.name}</span>
            <span className="shrink-0 text-amber-300">{prospect.status}</span>
          </div>
          <p className="truncate text-slate-400">{prospect.company} · {prospect.service}</p>
        </li>
      ))}
    </ul>
  );
}

function ProspectionView({ body }: { body: ProspectionCounts }) {
  const figures = [
    { label: "En base", value: body.prospects },
    { label: "Démarchés", value: body.contacted },
    { label: "Relances", value: body.followUps },
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
