import { z } from "zod";

// Règles serveur des publications planifiées et des rushs. Déterministe : aucun appel à un modèle de langage.

const DAY = 24 * 60 * 60 * 1000;

/** Décalage de Paris, en minutes, à l'instant donné (heure d'été ou d'hiver). */
function parisOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Convertit une date et une heure saisies à Paris en instant UTC. */
export function parisToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Deux passes : la seconde corrige le décalage quand le changement d'heure tombe entre les deux.
  const first = naive - parisOffsetMinutes(new Date(naive)) * 60_000;
  return new Date(naive - parisOffsetMinutes(new Date(first)) * 60_000);
}

export const SchedulePostSchema = z.object({
  platform: z.enum(["instagram", "tiktok"]),
  format: z.enum(["FEED", "REELS", "STORIES"]),
  rushId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Heure attendue au format HH:MM."),
  caption: z.string().max(2200).optional(),
});

/** Une publication doit être planifiée au moins cinq minutes à l'avance, et pas plus d'un an. */
export function checkScheduleWindow(at: Date, now: Date): string | null {
  if (Number.isNaN(at.getTime())) return "Date ou heure invalide.";
  if (at.getTime() < now.getTime() + 5 * 60_000) return "La publication doit être planifiée au moins cinq minutes à l'avance.";
  if (at.getTime() > now.getTime() + 365 * DAY) return "La publication ne peut pas être planifiée plus d'un an à l'avance.";
  return null;
}

// Adresse d'un fichier Vercel Blob : hôte du stockage Vercel, en HTTPS uniquement.
export function isBlobUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export const RegisterRushSchema = z.object({
  url: z.string().max(500).refine(isBlobUrl, "Adresse de rush non reconnue."),
  fileName: z.string().trim().min(1).max(200).regex(/^[^\\/]+\.(mp4|mov)$/i, "Format non accepté : .mp4 ou .mov uniquement."),
  sizeMb: z.number().int().min(1).max(2048),
  contentType: z.enum(["video/mp4", "video/quicktime"]),
});
