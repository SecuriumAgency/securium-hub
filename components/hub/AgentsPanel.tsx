"use client";

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { formatAgo, useNow } from "@/lib/clock";
import type { AgentStatus, AgentTelemetry, TelemetryResponse } from "@/lib/telemetry";
import { useTelemetry } from "@/lib/use-telemetry";

const SKELETON_AGENTS = 6;

const statusStyle: Record<AgentStatus, { label: string; dot: string; text: string }> = {
  running: { label: "Actif", dot: "bg-emerald-400", text: "text-emerald-300" },
  idle: { label: "Inactif", dot: "bg-slate-500", text: "text-slate-400" },
  error: { label: "Erreur", dot: "bg-rose-400", text: "text-rose-300" },
  unknown: { label: "Inconnu", dot: "bg-slate-600", text: "text-slate-500" },
};

// Supervision des agents de Securium-OS, posée à gauche par-dessus la scène, hors du <Canvas>.
// Son état de polling est local : une actualisation ne re-rend que ce panneau.
export function AgentsPanel() {
  const { data, failed } = useTelemetry();
  const [open, setOpen] = useState(true);
  const running = data?.agents.filter((agent) => agent.status === "running").length;

  return (
    <section
      aria-label="Supervision des agents"
      className="absolute top-24 left-4 z-[45] flex max-h-[calc(100dvh-9rem)] w-72 flex-col rounded-2xl border border-white/10 bg-slate-900/50 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl sm:top-28 sm:left-6 sm:max-h-[calc(100dvh-10rem)]"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <Activity aria-hidden className="size-4 shrink-0 text-cyan-300" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Télémétrie</span>
          <span className="block text-sm font-semibold text-white">
            Agents{running === undefined ? "" : ` · ${running} actif${running > 1 ? "s" : ""}`}
          </span>
        </span>
        <ChevronDown aria-hidden className={`size-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-white/10 px-4 pt-3 pb-4">
          <PanelBody data={data} failed={failed} />
        </div>
      )}
    </section>
  );
}

function PanelBody({ data, failed }: { data: TelemetryResponse | null; failed: boolean }) {
  const now = useNow(15_000);

  if (!data && failed) {
    return (
      <p role="alert" className="text-xs text-rose-300">
        Télémétrie indisponible. Nouvel essai à la prochaine actualisation.
      </p>
    );
  }
  if (!data) {
    return (
      <ul aria-busy="true" className="space-y-3">
        {Array.from({ length: SKELETON_AGENTS }, (_, index) => (
          <li key={index} aria-hidden className="space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-2.5 w-full animate-pulse rounded bg-white/5" />
          </li>
        ))}
      </ul>
    );
  }
  if (!data.logAvailable && !data.processesAvailable) {
    return (
      <p className="text-xs leading-relaxed text-slate-400">
        Télémétrie locale indisponible : ce Hub ne tourne pas sur le poste Securium. Le journal des agents et leurs
        processus ne sont lisibles que depuis <span className="font-mono text-slate-300">C:\Securium-Workspace</span>.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {data.agents.map((agent) => (
          <AgentRow key={agent.name} agent={agent} />
        ))}
      </ul>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {data.processesAvailable ? "Statut lu dans les processus du poste" : "Processus illisibles : statut inconnu"}
        {" · "}
        {data.logUpdatedAt ? `journal écrit ${formatAgo(data.logUpdatedAt, now)}` : "journal introuvable"}
        {failed && <span className="text-amber-300"> · actualisation en échec</span>}
      </p>

      {data.recent.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Journal</h3>
          <ol className="mt-2 space-y-1.5 font-mono text-[10.5px] leading-snug">
            {data.recent.map((event, index) => (
              <li key={index} className="line-clamp-2 break-words text-slate-400">
                <span className={event.status === "error" ? "text-rose-300" : "text-cyan-300"}>{event.agent}</span>{" "}
                {event.action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function AgentRow({ agent }: { agent: AgentTelemetry }) {
  const style = statusStyle[agent.status];

  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="relative flex size-2 shrink-0">
          {agent.status === "running" && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span className={`relative inline-flex size-2 rounded-full ${style.dot}`} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{agent.name}</span>
        <span className={`text-[10px] font-medium uppercase tracking-wider ${style.text}`}>{style.label}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 pl-4 text-[11px] leading-snug break-words text-slate-400">
        {agent.lastEvent?.action ?? "Aucune activité dans le journal récent"}
      </p>
    </li>
  );
}
