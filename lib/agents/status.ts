import type { AgentEvent, AgentStatus, ProcessTelemetry, TelemetryReport } from "@/lib/telemetry";
import type { AgentDef } from "./registry";

// `absent` : l'agent du poste n'a rien signalé dans le rapport. `ready` : agent hors du poste (Vercel Cron, Hub,
// GitHub), prêt à servir entre deux runs ; il n'a pas de passage en cours à montrer.
export type DisplayStatus = AgentStatus | "absent" | "ready";

export type AgentState = {
  status: DisplayStatus;
  // Dernière action de l'agent dans le journal, ou null.
  lastAction: string | null;
  // Statut PM2 du processus lié, ou null si l'agent n'en a pas.
  pm2Status: string | null;
  // Événements récents de l'agent, du plus récent au plus ancien. Le journal n'est pas horodaté.
  events: AgentEvent[];
};

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  running: "En cours",
  idle: "À l’arrêt",
  error: "Erreur",
  unknown: "Inconnu",
  absent: "Non signalé",
  // En vert et compté « en cours » dans l'en-tête du cockpit, comme un agent qui tourne.
  ready: "En cours",
};

// Planificateur actif : un démon en ligne, ou un processus cron arrêté entre deux passages (état normal, pas une panne).
function isScheduled(process: ProcessTelemetry | undefined): boolean {
  return process?.status === "online" || (process?.status === "stopped" && Boolean(process.cron));
}

// Statut d'un processus PM2 lié à l'agent : en cours dès que le démon tourne (ou que son cron attend le
// prochain passage). Un passage échoué ne colore pas la carte : il reste lisible dans la dernière action.
function pm2Status(process: ProcessTelemetry): AgentStatus {
  if (isScheduled(process)) return "running";
  if (process.status === "stopped") return "idle";
  if (process.status === "errored") return "error";
  return "unknown";
}

// État d'un agent à partir du dernier rapport du poste. Rapport absent ou périmé : l'état est inconnu.
// Agent du poste : en cours tant que son processus PM2, ou celui qui le planifie, tourne.
// Hub, web, GitHub sans processus PM2 : en cours pendant un run, prêt sinon (ancien run échoué ou annulé compris).
export function agentState(agent: AgentDef, report: TelemetryReport | null, stale: boolean): AgentState {
  const fresh = report !== null && !stale;
  const pm2Process: ProcessTelemetry | undefined = agent.pm2Name
    ? report?.pm2.processes.find((item) => item.name === agent.pm2Name)
    : undefined;
  const planner: ProcessTelemetry | undefined = agent.plannedBy
    ? report?.pm2.processes.find((item) => item.name === agent.plannedBy)
    : undefined;
  const line = agent.telemetryName ? report?.agents.find((item) => item.name === agent.telemetryName) : undefined;
  const events = agent.telemetryName ? (report?.recent ?? []).filter((item) => item.agent === agent.telemetryName) : [];

  let status: DisplayStatus;
  if (agent.pm2Name) {
    // Processus PM2 : son état fait foi (cron entre deux passages = planifié). Absent de PM2 : non signalé.
    status = !fresh ? "unknown" : pm2Process ? pm2Status(pm2Process) : "absent";
  } else if (agent.kind !== "poste") {
    status = fresh && line?.status === "running" ? "running" : "ready";
  } else if (!fresh) {
    status = "unknown";
  } else if (isScheduled(planner)) {
    // Agent de script : en cours tant que son planificateur tourne, entre deux cycles compris.
    status = "running";
  } else {
    status = line?.status ?? "absent";
  }

  const pm2 = agent.pm2Name ? (fresh ? (pm2Process?.status ?? "absent") : "unknown") : null;
  return {
    status,
    lastAction: line?.lastEvent?.action ?? events[0]?.action ?? null,
    pm2Status: pm2,
    events,
  };
}
