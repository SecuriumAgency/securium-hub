import { z } from "zod";

// Règles du module Warm Calling : suivi des appels aux prospects déjà contactés par email.
// Module sans dépendance serveur : partagé par le tableau et par la route d'enregistrement.

export const CALL_STATUSES = {
  appele_sans_reponse: "📞 Appelé (Sans réponse)",
  audit_programme: "📅 Audit Programmé",
  non_interesse: "❌ Non intéressé",
} as const;

export type CallStatus = keyof typeof CALL_STATUSES;

export const CallStatusSchema = z.object({
  id: z.string().min(1).max(64),
  callStatus: z.enum(["appele_sans_reponse", "audit_programme", "non_interesse"]).nullable(),
});

/** Département d'un code postal (2 chiffres, 3 pour l'outre-mer, 2A/2B pour la Corse), ou null. */
export function departmentOf(postalCode: string): string | null {
  const value = postalCode.trim();
  if (!/^\d{5}$/.test(value)) return null;
  if (value.startsWith("97")) return value.slice(0, 3);
  if (value.startsWith("20")) return value < "20200" ? "2A" : "2B";
  return value.slice(0, 2);
}

/** Niche lisible en slug d'URL : « Couvreur & zinguerie » devient « couvreur-zinguerie ». */
export function nicheSlug(activity: string | null): string | null {
  if (!activity) return null;
  const slug = activity
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 2 ? slug : null;
}

/** Lien du tunnel /devis adapté à la niche et au département du prospect. */
export function demoLink(origin: string, activity: string | null, postalCode: string): string | null {
  const region = departmentOf(postalCode);
  if (!region) return null;
  const url = new URL("/devis", origin);
  const niche = nicheSlug(activity);
  if (niche) url.searchParams.set("niche", niche);
  url.searchParams.set("region", region);
  return url.toString();
}
