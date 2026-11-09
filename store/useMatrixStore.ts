import { create } from "zustand";
import { repairFor } from "@/lib/matrix/repairs";
import type { EcosystemMetrics } from "@/lib/matrix/metrics";
import { MATRIX_TOOLS, resolveSiteId, siteName } from "@/lib/matrix/tools";
import type { Site, SiteStatus } from "@/lib/sites";

// État du « cerveau » de la scène 3D : santé des sites, alertes de l'Orchestrateur, réparations en cours et
// journal. Les composants 3D lisent ce store ; les effets de bord (requêtes) passent par les actions.
export type NodeStatus = "active" | "working" | "success" | "error";
export type LogLevel = "info" | "success" | "warning" | "error";
export type MatrixLog = { id: number; at: number; level: LogLevel; scope: string | null; message: string };
export type PendingTask = {
  id: string;
  site: string;
  type: string;
  severity: "info" | "warning" | "critical";
  description: string | null;
};
export type SiteRuntime = { repairing: boolean; flashUntil: number; failedUntil: number; lastDispatchAt: number };

const EMPTY_RUNTIME: SiteRuntime = { repairing: false, flashUntil: 0, failedUntil: 0, lastDispatchAt: 0 };
// Un même site n'est pas relancé automatiquement plus d'une fois toutes les 30 minutes.
export const AUTO_COOLDOWN_MS = 30 * 60 * 1000;
const FLASH_MS = 4000;
const FAILURE_MS = 60_000;
const LOG_LIMIT = 120;
let logSequence = 0;

export type MatrixState = {
  selectedId: string | null;
  // Pilote automatique du Parc Sites : vrai = les alertes déclenchent les réparations sans intervention.
  autopilot: boolean;
  fleet: Record<string, SiteStatus>;
  pendingTotal: number;
  pendingBySite: Record<string, number>;
  sites: Record<string, SiteRuntime>;
  logs: MatrixLog[];
  // Métriques réelles (base de production), actualisées toutes les 30 s par le moteur.
  metrics: EcosystemMetrics | null;
  metricsFailed: boolean;
  select: (id: string | null) => void;
  setAutopilot: (enabled: boolean) => void;
  setFleet: (sites: Site[]) => void;
  setPending: (tasks: PendingTask[]) => void;
  setMetrics: (metrics: EcosystemMetrics) => void;
  failMetrics: () => void;
  log: (level: LogLevel, scope: string | null, message: string) => void;
  onAlertDetected: (task: PendingTask) => void;
  dispatchAgent: (siteId: string) => Promise<void>;
};

const withSite = (state: MatrixState, siteId: string, patch: Partial<SiteRuntime>) => ({
  sites: { ...state.sites, [siteId]: { ...(state.sites[siteId] ?? EMPTY_RUNTIME), ...patch } },
});

export const useMatrixStore = create<MatrixState>()((set, get) => ({
  selectedId: null,
  autopilot: true,
  fleet: {},
  pendingTotal: 0,
  pendingBySite: {},
  sites: {},
  logs: [],
  metrics: null,
  metricsFailed: false,

  select: (id) => set({ selectedId: id }),

  setMetrics: (metrics) => {
    const previous = get().metrics;
    set({ metrics, metricsFailed: false });
    // Nouveaux leads depuis le dernier relevé : le journal le signale, la scène reste silencieuse.
    const gained = previous ? metrics.leads.today - previous.leads.today : 0;
    if (gained > 0) {
      get().log("success", null, `+${gained} lead(s) reçu(s) aujourd'hui · ${metrics.leads.today} au total du jour`);
    }
  },

  failMetrics: () => set({ metricsFailed: true }),

  setAutopilot: (enabled) => {
    set({ autopilot: enabled });
    get().log(
      "info",
      "parc-sites",
      enabled ? "Pilote automatique activé pour le Parc Sites." : "Pilote automatique désactivé : réparations manuelles seulement.",
    );
  },

  setFleet: (sites) => {
    const next = Object.fromEntries(sites.map((site) => [site.id, site.status]));
    if (JSON.stringify(get().fleet) === JSON.stringify(next)) return;
    set({ fleet: next });
  },

  setPending: (tasks) => {
    const bySite: Record<string, number> = {};
    for (const task of tasks) {
      if (task.severity === "info") continue;
      const siteId = resolveSiteId(task.site) ?? task.site;
      bySite[siteId] = (bySite[siteId] ?? 0) + 1;
    }
    const { pendingTotal, pendingBySite } = get();
    if (pendingTotal === tasks.length && JSON.stringify(pendingBySite) === JSON.stringify(bySite)) return;
    set({ pendingTotal: tasks.length, pendingBySite: bySite });
  },

  log: (level, scope, message) =>
    set((state) => ({
      logs: [...state.logs, { id: ++logSequence, at: Date.now(), level, scope, message }].slice(-LOG_LIMIT),
    })),

  onAlertDetected: (task) => {
    const { autopilot, sites, log, dispatchAgent } = get();
    const siteId = resolveSiteId(task.site) ?? task.site;
    const name = siteName(siteId);
    const detail = task.description?.trim() || task.type;
    log(task.severity === "critical" ? "error" : "warning", siteId, `Alerte ${task.severity} sur ${name} : ${detail}`);

    if (!autopilot) {
      log("info", siteId, `Pilote automatique désactivé : ${name} attend une action manuelle.`);
      return;
    }
    if (!repairFor(siteId)) {
      log("warning", siteId, `Aucun workflow de réparation rattaché à ${name} : action manuelle requise.`);
      return;
    }
    const last = sites[siteId]?.lastDispatchAt ?? 0;
    if (Date.now() - last < AUTO_COOLDOWN_MS) {
      log("info", siteId, `${name} : réparation déjà lancée il y a moins de 30 min, pas de relance.`);
      return;
    }
    void dispatchAgent(siteId);
  },

  dispatchAgent: async (siteId) => {
    const { log, sites } = get();
    const name = siteName(siteId);
    const target = repairFor(siteId);
    if (!target) {
      log("warning", siteId, `Aucun workflow de réparation rattaché à ${name}.`);
      return;
    }
    if (sites[siteId]?.repairing) return;

    set((state) => withSite(state, siteId, { repairing: true, lastDispatchAt: Date.now() }));
    log("info", siteId, `Félix Fix déployé sur ${name} · ${target.label}`);

    try {
      const response = await fetch("/api/ecosystem/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? `réponse ${response.status}`);

      set((state) => withSite(state, siteId, { repairing: false, flashUntil: Date.now() + FLASH_MS }));
      log("success", siteId, `${name} : API 200. ${data.message ?? "Workflow lancé."}`);
      window.setTimeout(() => set((state) => withSite(state, siteId, { flashUntil: 0 })), FLASH_MS);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      set((state) => withSite(state, siteId, { repairing: false, failedUntil: Date.now() + FAILURE_MS }));
      log("error", siteId, `Réparation de ${name} échouée : ${reason}`);
      window.setTimeout(() => set((state) => withSite(state, siteId, { failedUntil: 0 })), FAILURE_MS);
    }
  },
}));

// Statut visuel d'un site : réparation (orange) > succès (vert pulsé) > erreur (rouge) > alerte en attente (orange).
export function siteNodeStatus(state: MatrixState, siteId: string): NodeStatus {
  const runtime = state.sites[siteId];
  const now = Date.now();
  if (runtime?.repairing) return "working";
  if (runtime && runtime.flashUntil > now) return "success";
  if (runtime && runtime.failedUntil > now) return "error";
  if (state.fleet[siteId] === "offline") return "error";
  if ((state.pendingBySite[siteId] ?? 0) > 0) return "working";
  return "active";
}

// Statut des bâtiments d'outils : seuls le Parc Sites, l'Escadron et la tour centrale ont une activité suivie.
export function toolNodeStatus(state: MatrixState, toolId: string): NodeStatus {
  if (toolId === "escadron") {
    return Object.values(state.sites).some((runtime) => runtime.repairing) ? "working" : "active";
  }
  if (toolId === "parc-sites") {
    const sitesIds = Object.keys(state.fleet);
    if (sitesIds.some((id) => state.fleet[id] === "offline")) return "error";
    const busy = Object.values(state.pendingBySite).some((count) => count > 0) || Object.values(state.sites).some((r) => r.repairing);
    return busy ? "working" : "active";
  }
  if (toolId === "securium-os") return state.pendingTotal > 0 ? "working" : "active";
  return "active";
}

export function nodeStatus(state: MatrixState, id: string): NodeStatus {
  return MATRIX_TOOLS.some((tool) => tool.id === id) ? toolNodeStatus(state, id) : siteNodeStatus(state, id);
}
