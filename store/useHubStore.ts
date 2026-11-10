import { useEffect } from "react";
import { create } from "zustand";
import { GRID_MAP, PROSPECT_BUILDING_ID, SITE_MAPPING } from "@/components/3d/hubGrid";
import type { B2BProspect, B2BProspectsResponse } from "@/lib/b2b/types";
import { toolForNode } from "@/lib/coreToolsRegistry";
import { useCoreToolsStore } from "./useCoreToolsStore";
import type { LeadsResponse } from "@/lib/leads";
import { startPolling } from "@/lib/poll";
import { initialSites } from "@/lib/sites";

// État du hub 3D : moment de la journée (éclairage), état du réseau multi-sites, sites et bâtiment survolé.
export type TimeOfDay = "jour" | "nuit";
// Éclairage : « auto » suit l'heure réelle ; « jour » ou « nuit » forcent l'ambiance, pour une lecture constante du NOC.
export type LightingMode = "auto" | "jour" | "nuit";

// Moment effectif : l'heure réelle en mode auto, sinon le mode forcé.
const resolveTime = (mode: LightingMode, clock: TimeOfDay): TimeOfDay => (mode === "auto" ? clock : mode);
export type SystemStatus = "online" | "maintenance";
export type SiteStatus = "online" | "offline" | "maintenance";

// Entrée du journal d'activité du NOC : horodatée, affichée dans la barre latérale.
export type LogLevel = "info" | "warn" | "error";
export type SystemLog = { id: string; timestamp: number; message: string; level: LogLevel };

// Un site du réseau, relié à un bâtiment du plan par son identifiant. activeVisitors vaut null tant qu'aucune
// source temps réel n'existe : l'infobulle l'affiche comme non disponible.
export type SiteData = {
  id: string;
  name: string;
  status: SiteStatus;
  activeVisitors: number | null;
};

// Réponse de /api/fleet : statut de chaque site, lu sur son dernier déploiement de production Vercel.
type FleetSite = { id: string; name: string; status: "online" | "offline" | "unknown" };
type FleetResponse = { sites: FleetSite[] };

// « unknown » : statut pas encore reçu, ou API Vercel injoignable pour ce site. On le montre en maintenance, pour vérifier.
const FLEET_TO_HUB: Record<FleetSite["status"], SiteStatus> = { online: "online", offline: "offline", unknown: "maintenance" };

// Bâtiments du plan et leur site. La boutique n'est rattachée à aucun site.
const PLAN_SITES: { id: string; label: string; siteId?: string }[] = [
  ...GRID_MAP.buildings.map((building) => ({ id: building.id, label: building.label, siteId: SITE_MAPPING[building.id] })),
  { id: GRID_MAP.shopSite.id, label: GRID_MAP.shopSite.label },
];

type HubState = {
  // Moment effectif (éclairage) : dérivé de l'heure réelle et du mode d'éclairage.
  timeOfDay: TimeOfDay;
  clockTimeOfDay: TimeOfDay;
  lightingMode: LightingMode;
  setLightingMode: (mode: LightingMode) => void;
  systemStatus: SystemStatus;
  activeNode: string | null;
  // Nœud sélectionné (clic sur un bâtiment ou dans la barre) : la caméra s'en approche et la barre le surligne.
  selectedNode: string | null;
  selectNode: (id: string | null) => void;
  // Incrémenté par « Réinitialiser la vue » : la caméra revient à sa position de départ.
  viewVersion: number;
  // Statut du réseau : sites des bâtiments, chargement en cours, échec du dernier appel.
  sitesNetwork: SiteData[];
  isLoading: boolean;
  hasError: boolean;
  // Journal d'activité : scans et connexions aux sites, les plus anciens en tête.
  systemLogs: SystemLog[];
  addLog: (message: string, level: LogLevel) => void;
  // Reçoit l'heure réelle (horloge) : sans effet sur le moment effectif si le mode est forcé.
  setTimeOfDay: (clockValue: TimeOfDay) => void;
  setSystemStatus: (systemStatus: SystemStatus) => void;
  setActiveNode: (activeNode: string | null) => void;
  resetView: () => void;
  fetchNetworkStatus: () => Promise<void>;
  // Leads entrants, du plus récent au plus ancien. Sans téléphone ni e-mail : le hub n'en a pas besoin.
  leads: HubLead[];
  leadsReady: boolean;
  leadsFailed: boolean;
  // Leads arrivés depuis le dernier passage sur le bâtiment de prospection.
  unseenLeads: number;
  leadsNewestAt: string | null;
  seenLeadsAt: string | null;
  ingestLeads: (response: LeadsResponse) => void;
  setLeadsFailed: () => void;
  markLeadsSeen: () => void;
  // Demandes B2B : la barre latérale les liste, le bâtiment de prospection clignote tant qu'une attend un audit.
  b2bProspects: B2BProspect[];
  setB2BProspects: (prospects: B2BProspect[]) => void;
};

// Lead tel qu'affiché dans le hub : nom, service, site et date. Le téléphone et l'e-mail restent dans l'API.
export type HubLead = {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  service: string;
  source: string;
  createdAt: string;
};

// Compteur des entrées du journal, et plafond : le journal ne grossit pas sans limite.
let logSequence = 0;
const MAX_SYSTEM_LOGS = 200;
// Synchronisation des leads : les leads arrivent par /api/leads/inbound, le hub les relit toutes les 15 s.
const LEADS_INTERVAL_MS = 15_000;
const SEEN_KEY = "securium-hub:leads-vus-jusqua";
const MAX_ARRIVAL_LOGS = 5;

export const useHubStore = create<HubState>()((set, get) => ({
  timeOfDay: "jour",
  clockTimeOfDay: "jour",
  lightingMode: "auto",
  setLightingMode: (lightingMode) => set((state) => ({ lightingMode, timeOfDay: resolveTime(lightingMode, state.clockTimeOfDay) })),
  // Statut simulé : aucune télémétrie n'alimente encore cette valeur.
  systemStatus: "online",
  activeNode: null,
  selectedNode: null,
  // Sélectionner le bâtiment de prospection vaut accusé de réception : les leads en attente sont marqués vus.
  // L'outil actif, lui, vit dans le store du Securium Core (useCoreToolsStore).
  selectNode: (selectedNode) => {
    set({ selectedNode });
    useCoreToolsStore.getState().setActiveTool(toolForNode(selectedNode)?.id ?? null);
    if (selectedNode === PROSPECT_BUILDING_ID) get().markLeadsSeen();
  },
  viewVersion: 0,
  sitesNetwork: [],
  isLoading: false,
  hasError: false,
  systemLogs: [],
  addLog: (message, level) =>
    set((state) => {
      logSequence += 1;
      const entry: SystemLog = { id: `log-${logSequence}`, timestamp: Date.now(), message, level };
      return { systemLogs: [...state.systemLogs, entry].slice(-MAX_SYSTEM_LOGS) };
    }),
  setTimeOfDay: (clockValue) =>
    set((state) => ({ clockTimeOfDay: clockValue, timeOfDay: resolveTime(state.lightingMode, clockValue) })),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setActiveNode: (activeNode) => set({ activeNode }),
  // « Vue globale » : la caméra revient à sa place de départ, et la sélection est levée.
  resetView: () => {
    useCoreToolsStore.getState().setActiveTool(null);
    set((state) => ({ viewVersion: state.viewVersion + 1, selectedNode: null }));
  },
  // Vide tant que la route protégée n'a pas répondu (voir useB2BPolling) : aucune donnée B2B dans le bundle.
  b2bProspects: [],
  setB2BProspects: (b2bProspects) => set({ b2bProspects }),
  leads: [],
  leadsReady: false,
  leadsFailed: false,
  unseenLeads: 0,
  leadsNewestAt: null,
  seenLeadsAt: null,
  // Reçoit la réponse de /api/leads. Le premier passage ne signale rien : l'historique n'est pas une nouveauté. Ensuite,
  // chaque lead plus récent que le dernier passage part au journal, et compte comme « non vu » jusqu'au passage sur le bâtiment.
  ingestLeads: (response) => {
    const { leadsNewestAt, seenLeadsAt, leadsReady, addLog } = get();
    const siteNames = new Map(initialSites.map((site) => [site.id, site.name]));
    const leads: HubLead[] = response.leads.map((lead) => ({
      id: lead.id,
      siteId: lead.siteId,
      siteName: siteNames.get(lead.siteId) ?? lead.siteId,
      name: lead.name,
      service: lead.service,
      source: lead.source,
      createdAt: lead.createdAt,
    }));
    const newestAt = leads[0]?.createdAt ?? null;
    const firstLoad = !leadsReady;
    // Repère « vu » : celui du navigateur, sinon le plus récent au premier passage. Chaîne vide si aucun lead encore.
    const seen = seenLeadsAt ?? readSeenAt() ?? newestAt ?? "";
    if (seenLeadsAt === null) writeSeenAt(seen);

    if (!firstLoad) {
      const arrivals = leads.filter((lead) => lead.createdAt > (leadsNewestAt ?? "")).slice(0, MAX_ARRIVAL_LOGS);
      // Du plus ancien au plus récent, comme le journal.
      for (const lead of arrivals.reverse()) addLog(`Nouveau lead · ${lead.siteName} · ${lead.service}`, "warn");
    } else {
      addLog(`Leads synchronisés : ${leads.length} reçu(s)`, "info");
    }

    const unseenLeads = leads.filter((lead) => lead.createdAt > seen).length;
    set({ leads, leadsReady: true, leadsFailed: false, leadsNewestAt: newestAt, seenLeadsAt: seen, unseenLeads });
  },
  setLeadsFailed: () => set({ leadsFailed: true }),
  // Passage sur le bâtiment de prospection : tous les leads reçus jusqu'ici sont vus, l'alerte et le PNJ Prospect s'arrêtent.
  markLeadsSeen: () => {
    const { leadsNewestAt, unseenLeads } = get();
    if (unseenLeads === 0 || leadsNewestAt === null) return;
    writeSeenAt(leadsNewestAt);
    set({ seenLeadsAt: leadsNewestAt, unseenLeads: 0 });
  },
  fetchNetworkStatus: async () => {
    const { addLog } = get();
    set({ isLoading: true, hasError: false });
    addLog("Scan du réseau multi-sites démarré", "info");
    try {
      const response = await fetch("/api/fleet", { cache: "no-store" });
      if (!response.ok) throw new Error(`/api/fleet a répondu ${response.status}`);
      const { sites } = (await response.json()) as FleetResponse;
      const fleet = new Map(sites.map((site) => [site.id, site]));
      const sitesNetwork = PLAN_SITES.flatMap<SiteData>(({ id, label, siteId }) => {
        if (!siteId) return [];
        const site = fleet.get(siteId);
        const status = site ? (FLEET_TO_HUB[site.status] ?? "maintenance") : "maintenance";
        return [{ id, name: site?.name ?? label, status, activeVisitors: null }];
      });
      set({ sitesNetwork, isLoading: false });
      // Une ligne par site, selon son statut réel.
      for (const site of sitesNetwork) {
        if (site.status === "online") addLog(`Connexion à ${site.name} établie`, "info");
        else if (site.status === "offline") addLog(`${site.name} : hors ligne`, "error");
        else addLog(`${site.name} : statut inconnu, à vérifier`, "warn");
      }
    } catch (error) {
      // Réseau ou API injoignable : par précaution, tous les bâtiments passent en maintenance.
      console.error("[hub] statut du réseau indisponible :", error instanceof Error ? error.message : "erreur inconnue");
      const fallback = PLAN_SITES.map(({ id, label }) => ({ id, name: label, status: "maintenance" as const, activeVisitors: null }));
      set({ sitesNetwork: fallback, isLoading: false, hasError: true });
      addLog("Scan impossible : API injoignable, statuts en maintenance par précaution", "error");
    }
  },
}));

/** Jour entre 7 h et 19 h (heure locale du navigateur), nuit sinon. */
export function timeOfDayAt(date: Date): TimeOfDay {
  const hour = date.getHours();
  return hour >= 7 && hour < 19 ? "jour" : "nuit";
}

/** Recale l'éclairage sur l'heure réelle au montage, puis chaque minute. */
export function useHubClock() {
  const setTimeOfDay = useHubStore((state) => state.setTimeOfDay);
  useEffect(() => {
    const sync = () => setTimeOfDay(timeOfDayAt(new Date()));
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, [setTimeOfDay]);
}

/** Charge l'état du réseau au montage de la surcouche. */
export function useNetworkStatus() {
  const fetchNetworkStatus = useHubStore((state) => state.fetchNetworkStatus);
  useEffect(() => {
    void fetchNetworkStatus();
  }, [fetchNetworkStatus]);
}

/** Synchronise les leads entrants toutes les 15 s, tant que l'onglet est visible (et dès qu'il redevient visible). */
export function useLeadsPolling() {
  useEffect(
    () =>
      startPolling<LeadsResponse>(
        "/api/leads",
        LEADS_INTERVAL_MS,
        (response) => useHubStore.getState().ingestLeads(response),
        () => useHubStore.getState().setLeadsFailed(),
      ),
    [],
  );
}

// Repère « leads vus » : tenu par le navigateur, donc par visiteur. Sans stockage (navigation privée), il reste en mémoire.
function readSeenAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeenAt(value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    // Stockage indisponible : le repère ne survit pas au rechargement, la session reste correcte.
  }
}

/** Demandes B2B : lues depuis la route admin toutes les 60 s, tant que l'onglet est visible. */
export function useB2BPolling() {
  useEffect(
    () =>
      startPolling<B2BProspectsResponse>("/api/b2b/prospects", 60_000, (body) =>
        useHubStore.getState().setB2BProspects(body.prospects),
      ),
    [],
  );
}

/** Libellé lisible d'un bâtiment ou de la boutique, à partir de son identifiant de plan. */
export function buildingLabel(id: string | null): string | null {
  if (!id) return null;
  if (id === GRID_MAP.shopSite.id) return GRID_MAP.shopSite.label;
  return GRID_MAP.buildings.find((building) => building.id === id)?.label ?? toolForNode(id)?.label ?? null;
}
