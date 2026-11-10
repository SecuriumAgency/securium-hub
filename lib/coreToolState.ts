// État de service des outils du Securium Core, et couleur de lueur qui l'accompagne. Fonctions pures : aucune lecture de store,
// aucun appel réseau. Le hub fournit les entrées ; ce module décide.
import type { StateSource } from "./coreToolsRegistry";
import { pm2Health, type TelemetryResponse } from "./telemetry";

export type ServiceState = "ok" | "warning" | "error" | "unknown";

// Vert OK, ambre avertissement, rouge erreur ; gris quand l'état n'est pas connu.
export const STATE_GLOW: Record<ServiceState, string> = {
  ok: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
  unknown: "#64748b",
};

export type ServiceInputs = {
  // Dernier rapport de télémétrie reçu (null tant qu'il n'y a rien).
  telemetry: TelemetryResponse | null;
  // Statut des sites du réseau (store du hub).
  sites: { status: "online" | "offline" | "maintenance" }[];
  // Demandes B2B qui attendent un audit.
  pendingB2B: number;
};

// Un rapport périmé ne dit plus ce qui tourne : l'état est alors inconnu, pas ok.
function freshReport(telemetry: TelemetryResponse | null) {
  return telemetry && !telemetry.stale ? telemetry.report : null;
}

export function deriveServiceState(source: StateSource, inputs: ServiceInputs): ServiceState {
  switch (source) {
    case "agents": {
      const report = freshReport(inputs.telemetry);
      if (!report) return "unknown";
      if (report.agents.some((agent) => agent.status === "error")) return "error";
      if (report.agents.some((agent) => agent.status === "unknown")) return "warning";
      return "ok";
    }
    case "pm2": {
      if (!freshReport(inputs.telemetry)) return "unknown";
      const health = pm2Health(inputs.telemetry);
      return health === "halted" ? "error" : health === "degraded" ? "warning" : "ok";
    }
    case "fleet": {
      if (inputs.sites.length === 0) return "unknown";
      if (inputs.sites.some((site) => site.status === "offline")) return "error";
      if (inputs.sites.some((site) => site.status === "maintenance")) return "warning";
      return "ok";
    }
    case "b2b":
      return inputs.pendingB2B > 0 ? "warning" : "ok";
    case "none":
      return "unknown";
  }
}
