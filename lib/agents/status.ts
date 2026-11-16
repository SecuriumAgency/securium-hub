import type { AgentEvent, AgentStatus, ProcessTelemetry, TelemetryReport } from "@/lib/telemetry";
import type { AgentDef } from "./registry";

// `absent` : l'agent du poste n'a rien signalé dans le rapport. `not-watched` : aucun signal de cet agent dans le
// rapport (workflow automatique sans run connu). `ready` : agent hors du poste, prêt à servir sans tourner en
// continu (à la demande, ou planifié ailleurs que sur le poste) ; il n'a pas de passage en cours à montrer.
export type DisplayStatus = AgentStatus | "absent" | "not-watched" | "ready";

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
  "not-watched": "Hors surveillance",
  ready: "Prêt",
};

// Agent lancé à la demande (bouton du cockpit, page du Hub) : entre deux lancements, il est prêt. Son dernier run,
// même vieux, annulé ou échoué, reste lisible sur sa fiche (dernière action), sans le mettre en erreur.
function isOnDemand(agent: AgentDef): boolean {
  return Boolean(agent.triggerId) || agent.schedule.startsWith("À la demande");
}

// Planificateur actif : un démon en ligne, ou un processus cron arrêté entre deux passages (état normal, pas une panne).
function isScheduled(process: ProcessTelemetry | undefined): boolean {
  return process?.status === "online" || (process?.status === "stopped" && Boolean(process.cron));
}

// Statut d'un processus PM2 lié à l'agent. `healthy` : dernière ligne du journal de l'agent sans erreur.
function pm2Status(process: ProcessTelemetry, healthy: boolean): AgentStatus {
  if (process.status === "online" || isScheduled(process)) return healthy ? "running" : "error";
  if (process.status === "stopped") return "idle";
  if (process.status === "errored") return "error";
  return "unknown";
}

// État d'un agent à partir du dernier rapport du poste. Rapport absent ou périmé : l'état est inconnu.
// Agent du poste planifié par un processus PM2 (cron) : actif tant que son dernier cycle est sain.
// Hub, web, GitHub : statut seulement si le rapport le donne (run réel), sinon hors surveillance.
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
  // Dernier cycle sain : la dernière ligne du journal de l'agent n'est pas une erreur.
  const healthy = line?.status !== "error";

  let status: DisplayStatus;
  if (agent.pm2Name) {
    // Processus PM2 : son état fait foi (cron entre deux passages = planifié). Absent de PM2 : non signalé.
    status = !fresh ? "unknown" : pm2Process ? pm2Status(pm2Process, healthy) : "absent";
  } else if (agent.kind !== "poste") {
    // Run réel transmis par le poste : il fait foi, sauf pour un agent à la demande, prêt entre deux lancements.
    // Sans télémétrie (Chasseur sur Vercel Cron, audit SEO du Hub), l'agent ne dépend pas du poste : il est prêt.
    if (fresh && line && (line.status === "running" || !isOnDemand(agent))) status = line.status;
    else if (!agent.telemetryName || isOnDemand(agent)) status = "ready";
    else status = "not-watched";
  } else if (!fresh) {
    status = "unknown";
  } else if (agent.telemetryName) {
    // Agent de script : « arrêté » entre deux cycles est normal si son planificateur tourne.
    status = line ? (line.status === "idle" && isScheduled(planner) ? "running" : line.status) : "absent";
  } else {
    status = "absent";
  }

  const pm2 = agent.pm2Name ? (fresh ? (pm2Process?.status ?? "absent") : "unknown") : null;
  return {
    status,
    lastAction: line?.lastEvent?.action ?? events[0]?.action ?? null,
    pm2Status: pm2,
    events,
  };
}
