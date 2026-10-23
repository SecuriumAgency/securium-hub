// Télémétrie des agents de Securium-OS, renvoyée par GET /api/telemetry.

// running : son script tourne sur le poste. idle : il ne tourne pas. error : il ne tourne pas et
// sa dernière ligne du journal est une erreur. unknown : processus illisibles (Hub hors Windows).
export type AgentStatus = "running" | "idle" | "error" | "unknown";

// Ligne du journal logs/agent-activity.log. Le journal n'est pas horodaté.
export type AgentEvent = {
  agent: string;
  status: "active" | "paused" | "error";
  action: string;
};

export type AgentTelemetry = {
  name: string;
  status: AgentStatus;
  // Dernière ligne de l'agent parmi celles lues en fin de journal ; null s'il n'y figure pas.
  lastEvent: AgentEvent | null;
};

export type TelemetryResponse = {
  // false : journal introuvable, typiquement quand le Hub tourne sur Vercel et non sur le poste.
  logAvailable: boolean;
  // Dernière écriture du journal : seul repère temporel, les lignes n'ont pas d'horodatage.
  logUpdatedAt: string | null;
  // false : liste des processus indisponible (hors Windows, ou PowerShell en échec).
  processesAvailable: boolean;
  agents: AgentTelemetry[];
  // Lignes les plus récentes du journal, la plus récente en premier.
  recent: AgentEvent[];
  updatedAt: string;
};
