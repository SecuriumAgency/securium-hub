// Télémétrie des agents de Securium-OS. Le daemon securium-fleet-watch du poste la pousse toutes
// les 10 s (POST /api/telemetry, rapport TelemetryReport) ; le panneau « Agents » la lit
// (GET /api/telemetry, réponse TelemetryResponse).

// running : son script tourne sur le poste. idle : il ne tourne pas. error : il ne tourne pas et
// sa dernière ligne du journal est une erreur. unknown : processus du poste illisibles.
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

// Processus PM2 du poste : orchestrateur, dashboard, daemon. Jamais leur environnement.
export type ProcessTelemetry = {
  name: string;
  // Statut PM2 : online, stopped, errored, launching…
  status: string;
  // Démarrage du processus, null s'il ne tourne pas.
  upSince: string | null;
  restarts: number;
  memoryBytes: number | null;
  cpuPercent: number | null;
  // Relance planifiée (cron_restart) : un arrêt entre deux cycles est alors normal.
  cron: string | null;
};

// online : liste lue. offline : daemon PM2 arrêté. unavailable : PM2 introuvable ou illisible.
export type Pm2State = "online" | "offline" | "unavailable";

// Corps de POST /api/telemetry. Même forme que TelemetryReport dans
// Securium-OS/agent-dashboard/scripts/hub-telemetry.mts.
export type TelemetryReport = {
  // Nom du poste qui a produit le rapport.
  host: string;
  generatedAt: string;
  // Dernière écriture du journal : seul repère temporel, les lignes n'ont pas d'horodatage.
  logUpdatedAt: string | null;
  // false : liste des processus du poste indisponible, statuts des agents inconnus.
  processesAvailable: boolean;
  agents: AgentTelemetry[];
  // Lignes les plus récentes du journal, la plus récente en premier.
  recent: AgentEvent[];
  pm2: { state: Pm2State; processes: ProcessTelemetry[] };
};

export type TelemetryResponse = {
  // Réception du dernier rapport, à l'heure du Hub. null : aucun rapport depuis 24 h (daemon
  // arrêté, poste éteint ou HUB_API_KEY différente des deux côtés).
  reportedAt: string | null;
  // true : plus de rapport depuis 30 s, `report` ne dit plus ce qui tourne.
  stale: boolean;
  report: TelemetryReport | null;
  updatedAt: string;
};

// Signaux de la scène 3D, tirés du dernier rapport s'il est frais : un rapport périmé ne dit plus
// ce qui tourne, donc ni alerte ni flux. hqAlert : un agent critique est en erreur, le QG pulse en
// rouge. feedActive : le daemon de télémétrie est en ligne dans PM2, l'anneau du QG respire en cyan.
export type TelemetrySignals = { hqAlert: boolean; feedActive: boolean };

const CRITICAL_AGENTS = new Set(["Orchestrateur"]);
// Daemon qui pousse la télémétrie : tant qu'il tourne, le flux est vivant.
const FEED_PROCESS = "securium-fleet-watch";

export function telemetrySignals(data: TelemetryResponse): TelemetrySignals {
  const report = data.stale ? null : data.report;
  return {
    hqAlert: report?.agents.some((agent) => CRITICAL_AGENTS.has(agent.name) && agent.status === "error") ?? false,
    feedActive:
      report?.pm2.processes.some((service) => service.name === FEED_PROCESS && service.status === "online") ?? false,
  };
}

const AGENT_STATUSES: readonly string[] = ["running", "idle", "error", "unknown"];
const EVENT_STATUSES: readonly string[] = ["active", "paused", "error"];
const PM2_STATES: readonly string[] = ["online", "offline", "unavailable"];
// Textes tronqués, listes coupées : une ligne de journal trop longue ne doit pas faire rejeter
// tout le rapport. Seul un champ du mauvais type le fait rejeter.
const MAX_LENGTH = { host: 100, agent: 60, action: 300, process: 100, processStatus: 30, cron: 100 } as const;
const MAX_ITEMS = { agents: 32, recent: 40, processes: 32 } as const;

type Input = Record<string, unknown>;

const isRecord = (value: unknown): value is Input => typeof value === "object" && value !== null && !Array.isArray(value);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isOneOf = (value: unknown, allowed: readonly string[]): value is string =>
  typeof value === "string" && allowed.includes(value);

export function parseTelemetryReport(
  body: unknown,
): { ok: true; report: TelemetryReport } | { ok: false; errors: string[] } {
  if (!isRecord(body)) return { ok: false, errors: ["Le corps doit être un objet JSON."] };
  const errors: string[] = [];

  // Liste d'objets : null si le champ n'est pas un tableau, entrées invalides signalées et écartées.
  const list = <T>(value: unknown, field: string, max: number, parse: (item: unknown, at: string) => T | null) => {
    if (!Array.isArray(value)) {
      errors.push(`${field} doit être un tableau.`);
      return [];
    }
    return value.slice(0, max).flatMap((item, index) => {
      const parsed = parse(item, `${field}[${index}]`);
      return parsed === null ? [] : [parsed];
    });
  };

  const event = (value: unknown, at: string): AgentEvent | null => {
    if (!isRecord(value) || typeof value.agent !== "string" || typeof value.action !== "string") {
      errors.push(`${at} : agent et action (chaînes) sont requis.`);
      return null;
    }
    if (!isOneOf(value.status, EVENT_STATUSES)) {
      errors.push(`${at}.status doit valoir ${EVENT_STATUSES.join(", ")}.`);
      return null;
    }
    return {
      agent: clip(value.agent, MAX_LENGTH.agent),
      status: value.status as AgentEvent["status"],
      action: clip(value.action, MAX_LENGTH.action),
    };
  };

  const agent = (value: unknown, at: string): AgentTelemetry | null => {
    if (!isRecord(value) || typeof value.name !== "string") {
      errors.push(`${at}.name (chaîne) est requis.`);
      return null;
    }
    if (!isOneOf(value.status, AGENT_STATUSES)) {
      errors.push(`${at}.status doit valoir ${AGENT_STATUSES.join(", ")}.`);
      return null;
    }
    return {
      name: clip(value.name, MAX_LENGTH.agent),
      status: value.status as AgentStatus,
      lastEvent: value.lastEvent === null ? null : event(value.lastEvent, `${at}.lastEvent`),
    };
  };

  const service = (value: unknown, at: string): ProcessTelemetry | null => {
    if (!isRecord(value) || typeof value.name !== "string" || typeof value.status !== "string") {
      errors.push(`${at} : name et status (chaînes) sont requis.`);
      return null;
    }
    return {
      name: clip(value.name, MAX_LENGTH.process),
      status: clip(value.status, MAX_LENGTH.processStatus),
      upSince: isDate(value.upSince) ? value.upSince : null,
      restarts: isCount(value.restarts) ? value.restarts : 0,
      memoryBytes: isCount(value.memoryBytes) ? value.memoryBytes : null,
      cpuPercent: isCount(value.cpuPercent) ? value.cpuPercent : null,
      cron: typeof value.cron === "string" ? clip(value.cron, MAX_LENGTH.cron) : null,
    };
  };

  const host = typeof body.host === "string" ? body.host.trim() : "";
  const generatedAt = isDate(body.generatedAt) ? body.generatedAt : null;
  const logUpdatedAt = isDate(body.logUpdatedAt) ? body.logUpdatedAt : null;
  const processesAvailable = typeof body.processesAvailable === "boolean" ? body.processesAvailable : null;
  const pm2: Input = isRecord(body.pm2) ? body.pm2 : {};
  const pm2State = isOneOf(pm2.state, PM2_STATES) ? (pm2.state as Pm2State) : null;

  if (!host) errors.push("host (chaîne non vide) est requis.");
  if (!generatedAt) errors.push("generatedAt doit être une date ISO.");
  if (body.logUpdatedAt !== null && !logUpdatedAt) errors.push("logUpdatedAt doit être une date ISO ou null.");
  if (processesAvailable === null) errors.push("processesAvailable doit être un booléen.");
  if (!pm2State) errors.push(`pm2.state doit valoir ${PM2_STATES.join(", ")}.`);

  const agents = list(body.agents, "agents", MAX_ITEMS.agents, agent);
  const recent = list(body.recent, "recent", MAX_ITEMS.recent, event);
  const processes = list(pm2.processes, "pm2.processes", MAX_ITEMS.processes, service);

  if (errors.length > 0 || !generatedAt || processesAvailable === null || !pm2State) return { ok: false, errors };
  return {
    ok: true,
    report: {
      host: clip(host, MAX_LENGTH.host),
      generatedAt,
      logUpdatedAt,
      processesAvailable,
      agents,
      recent,
      pm2: { state: pm2State, processes },
    },
  };
}
