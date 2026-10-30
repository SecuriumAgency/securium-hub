import data from "./mock-data.json";

// "unknown" : statut pas encore reçu de /api/fleet, ou API Vercel injoignable pour ce projet.
export type SiteStatus = "online" | "offline" | "unknown";

export type Site = {
  id: string;
  name: string;
  // URL de production, affichée sur /admin/fleet. Facultative : un site sans URL s'affiche sans lien.
  url?: string;
  kind: "hq" | "site";
  sector: string;
  status: SiteStatus;
  // ID du projet Vercel dont le dernier déploiement de production donne le statut du site.
  vercelProject?: string;
  // Trafic de référence, fixe : il ne sert qu'à la hauteur du bâtiment.
  traffic: number;
  coords: [number, number, number];
};

// Flotte au premier rendu, avant la réponse de /api/fleet. Sans projet Vercel rattaché (le QG),
// le statut reste fixe : en ligne.
export const initialSites: Site[] = (data as Omit<Site, "status">[]).map((site) => ({
  ...site,
  status: site.vercelProject ? "unknown" : "online",
}));

const numberFormat = new Intl.NumberFormat("fr-FR");

export function formatNumber(value: number) {
  return numberFormat.format(value);
}
