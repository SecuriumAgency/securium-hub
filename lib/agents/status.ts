import type { AgentEvent, AgentStatus, ProcessTelemetry, TelemetryReport } from "@/lib/telemetry";
import type { AgentDef } from "./registry";

// `absent` : l'agent du poste n'a rien signalé dans le rapport. `not-watched` : le Hub ne surveille pas cet
// agent (scripts manuels, workflows GitHub, audit à la demande).
export type DisplayStatus = AgentStatus | "absent" | "not-watched";

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
};

const PM2_TO_STATUS: Record<string, AgentStatus> = { online: "running", stopped: "idle", errored: "error" };

// État d'un agent à partir du dernier rapport du poste. Rapport absent ou périmé : l'état est inconnu.
export function agentState(agent: AgentDef, report: TelemetryReport | null, stale: boolean): AgentState {
  const fresh = report !== null && !stale;
  const pm2Process: ProcessTelemetry | undefined = agent.pm2Name
    ? report?.pm2.processes.find((item) => item.name === agent.pm2Name)
    : undefined;
  const line = agent.telemetryName ? report?.agents.find((item) => item.name === agent.telemetryName) : undefined;
  const events = agent.telemetryName ? (report?.recent ?? []).filter((item) => item.agent === agent.telemetryName) : [];

  let status: DisplayStatus;
  if (agent.kind !== "poste") {
    status = "not-watched";
  } else if (!fresh) {
    status = "unknown";
  } else if (agent.telemetryName) {
    status = line ? line.status : "absent";
  } else if (pm2Process) {
    status = PM2_TO_STATUS[pm2Process.status] ?? "unknown";
  } else {
    status = "absent";
  }

  const pm2Status = agent.pm2Name ? (fresh ? (pm2Process?.status ?? "absent") : "unknown") : null;
  return {
    status,
    lastAction: line?.lastEvent?.action ?? events[0]?.action ?? null,
    pm2Status,
    events,
  };
}
