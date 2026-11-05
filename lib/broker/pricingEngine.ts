// Moteur de prix du Lead Broker. Déterministe : aucun appel à un modèle, uniquement une grille et des règles.
// Module sans dépendance serveur : partagé par le tableau du broker, le tunnel public et la vente.

export type LeadQuality = "FAIBLE" | "MOYEN" | "FORT";

/** Prix de base par qualité, en euros, avant majoration de niche. */
export const BASE_PRICES: Record<LeadQuality, number> = { FAIBLE: 20, MOYEN: 45, FORT: 90 };

const PREMIUM_FACTOR = 1.3;
const BATCH_MIN_LEADS = 10;
const BATCH_RATE = 0.1;

const cents = (value: number) => Math.round(value * 100) / 100;

/** Niche en forme comparable : sans accents, minuscules, séparateurs réduits à un espace. */
export function normalizeNiche(niche: string): string {
  return niche
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** PAC et toiture complète : niches à forte valeur, majorées de 30 %. */
export function isPremiumNiche(niche: string): boolean {
  const normalized = normalizeNiche(niche);
  return normalized === "pac" || normalized === "pompe a chaleur" || normalized === "toiture complete";
}

/** Prix suggéré d'un lead : base de la qualité, majorée pour les niches premium. */
export function calculateSuggestedPrice(quality: LeadQuality, niche: string): number {
  const base = BASE_PRICES[quality];
  return cents(isPremiumNiche(niche) ? base * PREMIUM_FACTOR : base);
}

/**
 * Réduction de lot : 10 % dès 10 leads. Renvoie le total remisé et le montant retiré.
 * En dessous du seuil, le total n'est pas modifié.
 */
export function calculateBatchDiscount(totalLeads: number, baseTotalPrice: number): { total: number; discount: number; rate: number } {
  if (totalLeads < BATCH_MIN_LEADS) return { total: cents(baseTotalPrice), discount: 0, rate: 0 };
  const discount = cents(baseTotalPrice * BATCH_RATE);
  return { total: cents(baseTotalPrice - discount), discount, rate: BATCH_RATE };
}

/**
 * Qualité d'un lead capturé, à partir des seules réponses du formulaire :
 * urgence immédiate (+2) ou dans trois mois (+1), message détaillé (+1), code postal renseigné (+1).
 */
export function classifyLeadQuality(input: { urgency: string | null; message: string | null; postalCode: string | null }): LeadQuality {
  let score = 0;
  if (input.urgency === "immediat") score += 2;
  else if (input.urgency === "3_mois") score += 1;
  if ((input.message ?? "").trim().length >= 40) score += 1;
  if (input.postalCode) score += 1;
  if (score >= 3) return "FORT";
  if (score === 2) return "MOYEN";
  return "FAIBLE";
}
