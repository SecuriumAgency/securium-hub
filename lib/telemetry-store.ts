import { getCache } from "@vercel/functions";
import type { TelemetryReport } from "./telemetry";

// Dernier rapport du daemon securium-fleet-watch, gardé dans le Runtime Cache de Vercel : partagé
// par les instances de la région, contrairement à une variable du module, et sans écriture en base
// toutes les 10 s. Hors Vercel (npm run dev), @vercel/functions se rabat sur un cache en mémoire.
const cache = getCache({ namespace: "telemetry" });
// Les entrées survivent aux déploiements : changer la version si la forme de StoredReport change.
export const CACHE_KEY = "last-report:v1";
// Le dernier rapport reste lisible une journée, marqué périmé, puis expire.
export const REPORT_TTL_S = 24 * 60 * 60;
// Le daemon envoie un rapport toutes les 10 s : après trois manqués, le rapport est périmé.
export const STALE_AFTER_MS = 30_000;

// receivedAt est l'heure du Hub, et non generatedAt (horloge du poste) : la péremption se mesure
// sur une seule horloge.
export type StoredReport = { receivedAt: string; report: TelemetryReport };

export async function readStoredReport(): Promise<StoredReport | null> {
  // Seul l'enregistrement de la télémétrie écrit cette clé, avec ce type.
  return (await cache.get(CACHE_KEY)) as StoredReport | null;
}

export async function writeStoredReport(stored: StoredReport): Promise<void> {
  await cache.set(CACHE_KEY, stored, { ttl: REPORT_TTL_S });
}
