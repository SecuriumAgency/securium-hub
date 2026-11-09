import { useEffect } from "react";
import { create } from "zustand";
import { GRID_MAP, SITE_MAPPING } from "@/components/3d/hubGrid";

// État du hub 3D : moment de la journée (éclairage), état du réseau multi-sites, sites et bâtiment survolé.
export type TimeOfDay = "jour" | "nuit";
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
  timeOfDay: TimeOfDay;
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
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;
  setSystemStatus: (systemStatus: SystemStatus) => void;
  setActiveNode: (activeNode: string | null) => void;
  resetView: () => void;
  fetchNetworkStatus: () => Promise<void>;
};

// Compteur des entrées du journal, et plafond : le journal ne grossit pas sans limite.
let logSequence = 0;
const MAX_SYSTEM_LOGS = 200;

export const useHubStore = create<HubState>()((set, get) => ({
  timeOfDay: "jour",
  // Statut simulé : aucune télémétrie n'alimente encore cette valeur.
  systemStatus: "online",
  activeNode: null,
  selectedNode: null,
  selectNode: (selectedNode) => set({ selectedNode }),
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
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setActiveNode: (activeNode) => set({ activeNode }),
  // « Vue globale » : la caméra revient à sa place de départ, et la sélection est levée.
  resetView: () => set((state) => ({ viewVersion: state.viewVersion + 1, selectedNode: null })),
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

/** Libellé lisible d'un bâtiment ou de la boutique, à partir de son identifiant de plan. */
export function buildingLabel(id: string | null): string | null {
  if (!id) return null;
  if (id === GRID_MAP.shopSite.id) return GRID_MAP.shopSite.label;
  return GRID_MAP.buildings.find((building) => building.id === id)?.label ?? null;
}
