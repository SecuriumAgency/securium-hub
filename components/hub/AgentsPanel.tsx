"use client";

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { formatAgo, useNow } from "@/lib/clock";
import type { AgentStatus, AgentTelemetry, ProcessTelemetry, TelemetryReport, TelemetryResponse } from "@/lib/telemetry";
import { useTelemetry } from "@/lib/use-telemetry";

const SKELETON_AGENTS = 6;

type Style = { label: string; dot: string; text: string };

const statusStyle: Record<AgentStatus, Style> = {
  running: { label: "Actif", dot: "bg-emerald-400", text: "text-emerald-300" },
  idle: { label: "Inactif", dot: "bg-slate-500", text: "text-slate-400" },
  error: { label: "Erreur", dot: "bg-rose-400", text: "text-rose-300" },
  unknown: { label: "Inconnu", dot: "bg-slate-600", text: "text-slate-500" },
};

// Statuts PM2 courants. Les autres (launching, stopping…) sont transitoires et gardent leur nom.
const processStyle: Record<string, Style> = {
  online: { label: "En ligne", dot: "bg-emerald-400", text: "text-emerald-300" },
  stopped: { label: "Arrêté", dot: "bg-slate-500", text: "text-slate-400" },
  errored: { label: "Erreur", dot: "bg-rose-400", text: "text-rose-300" },
};
// Processus planifié (cron) arrêté entre deux cycles : état normal.
const scheduledStyle: Style = { label: "Planifié", dot: "bg-slate-500", text: "text-slate-400" };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

// Supervision des agents de Securium-OS, posée à gauche par-dessus la scène, hors du <Canvas>.
// Abonné au store de télémétrie (alimenté par Home) : une actualisation ne re-rend que ses abonnés.
export function AgentsPanel() {
  const { data, failed } = useTelemetry();
  const [open, setOpen] = useState(true);
  // Rapport périmé : on ne sait plus ce qui tourne, pas de compte.
  const live = data?.report && !data.stale ? data.report : null;
  const running = live?.agents.filter((agent) => agent.status === "running").length;

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
            Agents{running === undefined ? "" : ` · ${plural(running, "actif")}`}
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
  const { report, reportedAt, stale } = data;
  if (!report || !reportedAt) {
    return (
      <p className="text-xs leading-relaxed text-slate-400">
        Aucun rapport du poste Securium depuis 24 h. Le daemon{" "}
        <span className="font-mono text-slate-300">securium-fleet-watch</span> envoie l&apos;état des agents toutes
        les 10 s : vérifiez qu&apos;il tourne et que <span className="font-mono text-slate-300">HUB_API_KEY</span> est
        la même des deux côtés.
        {failed && <span className="text-amber-300"> Actualisation en échec.</span>}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {report.agents.map((agent) => (
          <AgentRow key={agent.name} agent={agent} stale={stale} />
        ))}
      </ul>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {stale ? (
          <span className="text-amber-300">
            Dernier rapport {formatAgo(reportedAt, now)} : daemon arrêté ou poste injoignable, statuts inconnus
          </span>
        ) : (
          `Rapport de ${report.host} reçu ${formatAgo(reportedAt, now)}`
        )}
        {!report.processesAvailable && " · processus du poste illisibles"}
        {" · "}
        {report.logUpdatedAt ? `journal écrit ${formatAgo(report.logUpdatedAt, now)}` : "journal introuvable"}
        {failed && <span className="text-amber-300"> · actualisation en échec</span>}
      </p>

      <div className={`mt-4 border-t border-white/10 pt-3 ${stale ? "opacity-60" : ""}`}>
        <Pm2Section pm2={report.pm2} live={!stale} now={now} />
      </div>

      {report.recent.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Journal</h3>
          <ol className="mt-2 space-y-1.5 font-mono text-[10.5px] leading-snug">
            {report.recent.map((event, index) => (
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

// Processus PM2 du poste : orchestrateur, dashboard, daemon de surveillance.
function Pm2Section({ pm2, live, now }: { pm2: TelemetryReport["pm2"]; live: boolean; now: number }) {
  return (
    <>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Poste Securium · PM2</h3>
      {pm2.state === "online" ? (
        pm2.processes.length > 0 ? (
          <ul className="mt-2 space-y-2.5">
            {pm2.processes.map((service) => (
              <ProcessRow key={service.name} service={service} live={live} now={now} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">Aucun processus géré par PM2.</p>
        )
      ) : (
        <p className="mt-2 text-xs text-amber-300">
          {pm2.state === "offline" ? "Le daemon PM2 est arrêté." : "PM2 illisible sur le poste."}
        </p>
      )}
    </>
  );
}

function ProcessRow({ service, live, now }: { service: ProcessTelemetry; live: boolean; now: number }) {
  const style =
    service.status === "stopped" && service.cron
      ? scheduledStyle
      : (processStyle[service.status] ?? { label: service.status, dot: "bg-amber-400", text: "text-amber-300" });
  const details = [
    service.upSince && `démarré ${formatAgo(service.upSince, now)}`,
    service.restarts > 0 && plural(service.restarts, "redémarrage"),
    service.memoryBytes !== null && `${Math.round(service.memoryBytes / 1_048_576)} Mo`,
  ].filter(Boolean);

  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="relative flex size-2 shrink-0">
          {live && service.status === "online" && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span className={`relative inline-flex size-2 rounded-full ${style.dot}`} />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white">{service.name}</span>
        <span className={`text-[10px] font-medium uppercase tracking-wider ${style.text}`}>{style.label}</span>
      </div>
      {details.length > 0 && <p className="mt-0.5 pl-4 text-[11px] leading-snug text-slate-400">{details.join(" · ")}</p>}
    </li>
  );
}

// Rapport périmé : le dernier statut connu ne dit plus si l'agent tourne.
function AgentRow({ agent, stale }: { agent: AgentTelemetry; stale: boolean }) {
  const status = stale ? "unknown" : agent.status;
  const style = statusStyle[status];

  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="relative flex size-2 shrink-0">
          {status === "running" && (
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
