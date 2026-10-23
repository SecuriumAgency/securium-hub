import data from "./mock-data.json";

// "unknown" : statut pas encore reçu de /api/fleet, ou API Vercel injoignable pour ce projet.
export type SiteStatus = "online" | "offline" | "unknown";

export type Site = {
  id: string;
  name: string;
  kind: "hq" | "site";
  sector: string;
  status: SiteStatus;
  // ID du projet Vercel dont le dernier déploiement de production donne le statut du site.
  vercelProject?: string;
  leads: number;
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
const percentFormat = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatConversion(site: Site) {
  return percentFormat.format(site.traffic > 0 ? site.leads / site.traffic : 0);
}
