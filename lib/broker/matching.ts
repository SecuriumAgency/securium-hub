import { departmentOf, nicheSlug } from "@/lib/warm-call";

// Matching strict lead / artisan : même niche (corps de métier) ET même zone. Déterministe, sans IA.
// Module sans dépendance serveur : partagé par le tableau du broker, la route de matching et le paiement.

export type MatchableLead = { niche: string; postalCode: string | null; region: string | null };
export type MatchableArtisan = { targetNiches: string[]; targetZipCodes: string[] };
export type MatchResult = { eligible: boolean; score: number; label: string };

// Synonymes de niche : « PAC » désigne la pompe à chaleur, et « couverture » ou « couvreur » désignent la toiture,
// quelle que soit l'écriture saisie ou déclarée.
const NICHE_ALIASES: Record<string, string> = { pac: "pompe-a-chaleur", couverture: "toiture", couvreur: "toiture" };

const slug = (value: string) => {
  const canonical = nicheSlug(value) ?? "";
  return NICHE_ALIASES[canonical] ?? canonical;
};

/** Forme canonique d'une niche (lead ou artisan), telle qu'elle est stockée côté artisan. */
export const canonicalNiche = slug;

/** Matching d'un lead et d'un artisan. Un lead n'est compatible qu'avec une niche couverte ET une zone couverte. */
export function evaluateMatch(lead: MatchableLead, artisan: MatchableArtisan): MatchResult {
  const niche = slug(lead.niche);
  const niches = artisan.targetNiches.map(slug);
  if (!niche || !niches.includes(niche)) {
    return { eligible: false, score: 0, label: "Corps de métier non couvert" };
  }

  const postal = (lead.postalCode ?? "").trim();
  const department = (postal ? departmentOf(postal) : null) ?? (lead.region ?? "").trim();
  const zones = artisan.targetZipCodes.map((zone) => zone.trim());
  if (postal && zones.includes(postal)) {
    return { eligible: true, score: 100, label: "Match 100% · même secteur et même zone" };
  }
  if (department && zones.includes(department)) {
    return { eligible: true, score: 80, label: "Match 80% · même secteur, même département" };
  }
  return { eligible: false, score: 0, label: "Zone non couverte" };
}

/** Matching d'un artisan sur plusieurs leads : éligible seulement si chaque lead est compatible ; score le plus bas. */
export function evaluateMatchAll(leads: MatchableLead[], artisan: MatchableArtisan): MatchResult {
  if (leads.length === 0) return { eligible: false, score: 0, label: "Aucun lead sélectionné" };
  const results = leads.map((lead) => evaluateMatch(lead, artisan));
  const failed = results.find((result) => !result.eligible);
  if (failed) return { eligible: false, score: 0, label: failed.label };
  const score = Math.min(...results.map((result) => result.score));
  return { eligible: true, score, label: score === 100 ? "Match 100% · même secteur et même zone" : "Match 80% · même secteur, même département" };
}

/** Normalise une liste de niches en slugs, sans doublon. */
export function normalizeNicheList(values: string[]): string[] {
  return [...new Set(values.map(slug).filter((value) => value.length >= 2))].slice(0, 20);
}

/** Normalise une liste de zones : codes postaux à 5 chiffres ou départements. */
export function normalizeZoneList(values: string[]): string[] {
  const valid = values.map((value) => value.trim().toUpperCase()).filter((value) => /^(\d{5}|\d{2,3}|2A|2B)$/.test(value));
  return [...new Set(valid)].slice(0, 50);
}
