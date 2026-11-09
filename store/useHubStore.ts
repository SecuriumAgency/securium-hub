import { useEffect } from "react";
import { create } from "zustand";
import { GRID_MAP } from "@/components/3d/hubGrid";

// État du hub 3D : moment de la journée (éclairage), état du réseau multi-sites et bâtiment survolé.
export type TimeOfDay = "jour" | "nuit";
export type SystemStatus = "online" | "maintenance";

type HubState = {
  timeOfDay: TimeOfDay;
  systemStatus: SystemStatus;
  activeNode: string | null;
  // Incrémenté par « Réinitialiser la vue » : la caméra revient à sa position de départ.
  viewVersion: number;
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;
  setSystemStatus: (systemStatus: SystemStatus) => void;
  setActiveNode: (activeNode: string | null) => void;
  resetView: () => void;
};

export const useHubStore = create<HubState>()((set) => ({
  timeOfDay: "jour",
  // Statut simulé : aucune télémétrie n'alimente encore cette valeur.
  systemStatus: "online",
  activeNode: null,
  viewVersion: 0,
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setActiveNode: (activeNode) => set({ activeNode }),
  resetView: () => set((state) => ({ viewVersion: state.viewVersion + 1 })),
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

/** Libellé lisible d'un bâtiment ou de la boutique, à partir de son identifiant de plan. */
export function buildingLabel(id: string | null): string | null {
  if (!id) return null;
  if (id === GRID_MAP.shopSite.id) return GRID_MAP.shopSite.label;
  return GRID_MAP.buildings.find((building) => building.id === id)?.label ?? null;
}
