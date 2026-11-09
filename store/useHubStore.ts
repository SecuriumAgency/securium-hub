import { useEffect } from "react";
import { create } from "zustand";
import { GRID_MAP } from "@/components/3d/hubGrid";

// État du hub 3D : moment de la journée (éclairage), état du réseau multi-sites, sites et bâtiment survolé.
export type TimeOfDay = "jour" | "nuit";
export type SystemStatus = "online" | "maintenance";
export type SiteStatus = "online" | "offline" | "maintenance";

// Un site du réseau. Son id est celui d'un bâtiment ou de la boutique dans hubGrid.ts : c'est ce lien qui le place dans le plan.
export type SiteData = {
  id: string;
  name: string;
  status: SiteStatus;
  activeVisitors: number;
};

type HubState = {
  timeOfDay: TimeOfDay;
  systemStatus: SystemStatus;
  activeNode: string | null;
  // Incrémenté par « Réinitialiser la vue » : la caméra revient à sa position de départ.
  viewVersion: number;
  // Sites du réseau, remplis par fetchNetworkStatus.
  sitesNetwork: SiteData[];
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;
  setSystemStatus: (systemStatus: SystemStatus) => void;
  setActiveNode: (activeNode: string | null) => void;
  resetView: () => void;
  fetchNetworkStatus: () => Promise<void>;
};

// Données simulées : un site vitrine en ligne, un site partenaire hors ligne, un Click & Collect en maintenance.
// À remplacer par l'appel réel à l'API de télémétrie.
const MOCK_SITES: SiteData[] = [
  { id: "immeuble-a-rue", name: "Site vitrine", status: "online", activeVisitors: 42 },
  { id: "immeuble-c-rue", name: "Site partenaire", status: "offline", activeVisitors: 0 },
  { id: "boutique", name: "Site Click & Collect", status: "maintenance", activeVisitors: 3 },
];

// Délai simulé d'un appel réseau.
const MOCK_LATENCY_MS = 400;

export const useHubStore = create<HubState>()((set) => ({
  timeOfDay: "jour",
  // Statut simulé : aucune télémétrie n'alimente encore cette valeur.
  systemStatus: "online",
  activeNode: null,
  viewVersion: 0,
  sitesNetwork: [],
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setActiveNode: (activeNode) => set({ activeNode }),
  resetView: () => set((state) => ({ viewVersion: state.viewVersion + 1 })),
  fetchNetworkStatus: async () => {
    // Simulation d'un appel réseau : le tableau reste vide pendant le délai.
    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
    set({ sitesNetwork: MOCK_SITES });
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
