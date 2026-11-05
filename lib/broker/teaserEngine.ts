import type { LeadQuality } from "@/lib/broker/pricingEngine";

// Teaser d'un lead : ce que l'artisan voit avant de payer. Déterministe, sans IA.
// Les coordonnées sont masquées : seul le paiement donne accès à la fiche complète.

export type TeaserLead = {
  niche: string;
  postalCode: string | null;
  phone: string;
  name: string;
  quality?: LeadQuality | null;
};

const QUALITY_TEXT: Record<LeadQuality, string> = { FAIBLE: "faible", MOYEN: "moyen", FORT: "élevé" };

/** Téléphone masqué : les deux premières paires visibles, le reste en étoiles (06 12 ** ** **). */
export function maskPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("33")) digits = `0${digits.slice(2)}`;
  if (digits.length < 4) return "** ** ** ** **";
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ** ** **`;
}

/** Nom masqué : initiale suivie de six étoiles (R. ******). */
export function maskName(name: string): string {
  const initial = name.trim().charAt(0).toUpperCase();
  return initial ? `${initial}. ******` : "******";
}

export function generateLeadTeaser(lead: TeaserLead): string {
  const niche = lead.niche.replace(/-/g, " ");
  const place = lead.postalCode ?? "code postal non renseigné";
  const budget = lead.quality ? QUALITY_TEXT[lead.quality] : "non évalué";
  return `Nouveau chantier ${niche} à ${place}. Budget estimé : ${budget}. Téléphone : ${maskPhone(lead.phone)}. Nom : ${maskName(lead.name)}.`;
}
