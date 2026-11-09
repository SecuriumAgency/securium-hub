// Règles du tunnel public /devis. Module sans dépendance serveur ni bibliothèque de validation : partagé par le
// formulaire (navigateur) et par l'API. La validation complète du lead vit dans lib/public-leads-schema.ts.

// Identifiant du site émetteur des leads publics. Ce n'est pas un site de la flotte : ces leads
// n'entrent pas dans les métriques des sites (lib/mock-data.json).
export const PUBLIC_SITE_ID = "devis-public";

export const URGENCIES = {
  immediat: "Immédiat",
  "3_mois": "Dans 3 mois",
  "6_mois": "Dans 6 mois",
} as const;

export type Urgency = keyof typeof URGENCIES;

// Niche : slug libre pour s'adapter aux campagnes (ex. « isolation »), validé avant tout usage.
export const NICHE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Région : numéro de département (01 à 95, 2A, 2B, 971 à 976), pour éviter tout texte arbitraire.
export const REGION_PATTERN = /^(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/;

export function sanitizeNiche(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  return value.length >= 2 && value.length <= 40 && NICHE_PATTERN.test(value) ? value : null;
}

export function sanitizeRegion(raw: string | undefined): string | null {
  const value = raw?.trim().toUpperCase() ?? "";
  return REGION_PATTERN.test(value) ? value : null;
}

/** Libellé lisible d'une niche : « pompe-a-chaleur » devient « pompe à chaleur ». */
export function nicheLabel(niche: string | null): string {
  return niche ? niche.replace(/-/g, " ") : "votre projet";
}

// Accord à la cession des coordonnées. Le texte affiché vit ici, et sa version est enregistrée avec chaque
// accord : à chaque changement de texte, la version change aussi, pour savoir ce qui a été accepté.
export const SHARE_CONSENT_VERSION = "devis-share-2026-11-06";
export const SHARE_CONSENT_TEXT =
  "J'accepte que mes coordonnées (nom, téléphone, e-mail, code postal) soient transmises à des artisans partenaires de ma région, pour l'étude de mon projet énergétique. Facultatif : sans cette case, mes coordonnées ne sont jamais transmises. Je peux retirer mon accord à tout moment.";

/** Preuve du consentement : horodatage et version du texte, uniquement si la case est cochée. */
export function consentProof(shareConsent: boolean, now: Date) {
  return shareConsent
    ? { consentToShare: true, consentAt: now, consentVersion: SHARE_CONSENT_VERSION }
    : { consentToShare: false, consentAt: null, consentVersion: null };
}
