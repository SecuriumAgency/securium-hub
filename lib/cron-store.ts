import { getCache } from "@vercel/functions";
import type { SiteStatus } from "./sites";

// Derniers relevés des tâches planifiées (Vercel Cron), gardés dans le Runtime Cache de Vercel : partagés
// par les instances de la région, comme le rapport de télémétrie. Hors Vercel, un cache en mémoire.
const cache = getCache({ namespace: "cron" });

// Les clés survivent aux déploiements : changer la version si la forme d'un relevé change.
export const FLEET_KEY = "fleet-status:v1";
export const SEO_KEY = "seo-audit:v1";

// Un relevé des statuts par jour : une semaine suffit. Un audit SEO par semaine : un mois.
export const FLEET_TTL_S = 7 * 24 * 60 * 60;
export const SEO_TTL_S = 30 * 24 * 60 * 60;

export type FleetSnapshot = {
  checkedAt: string;
  sites: { id: string; name: string; status: SiteStatus }[];
};

export type SeoSnapshot = {
  measuredAt: string;
  sites: { id: string; name: string; score: number; measured: number; total: number; recommendations: number }[];
};

export async function readSnapshot<T>(key: string): Promise<T | null> {
  return (await cache.get(key)) as T | null;
}

export async function writeSnapshot(key: string, value: unknown, ttl: number): Promise<void> {
  await cache.set(key, value, { ttl });
}
