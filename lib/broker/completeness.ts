// Complétude d'un prospect pour les trois systèmes qui le font vivre : le prospecteur (registre), le Chasseur
// (rédaction des emails, qui lit la ville et le métier) et le broker (ciblage des leads). Module pur.

export type CompletenessRow = {
  phone: string | null;
  email: string | null;
  city: string | null;
  activity: string | null;
  targetNiches: string[];
  targetZipCodes: string[];
};

export type System = "prospecteur" | "chasseur" | "broker";

// Six critères de même poids : un prospect configuré pour le matching les remplit tous.
export const CRITERIA = [
  { key: "phone", label: "Téléphone", system: "prospecteur" },
  { key: "email", label: "E-mail", system: "prospecteur" },
  { key: "city", label: "Ville", system: "chasseur" },
  { key: "activity", label: "Métier", system: "chasseur" },
  { key: "niches", label: "Niches ciblées", system: "broker" },
  { key: "zones", label: "Zones ciblées", system: "broker" },
] as const;

type CriterionKey = (typeof CRITERIA)[number]["key"];

const filled = (value: string | null | undefined) => (value ?? "").trim().length > 0;

/** Critères remplis pour un prospect, sous forme de drapeaux. */
export function criteriaOf(row: CompletenessRow): Record<CriterionKey, boolean> {
  return {
    phone: filled(row.phone),
    email: filled(row.email),
    city: filled(row.city),
    activity: filled(row.activity),
    niches: row.targetNiches.length > 0,
    zones: row.targetZipCodes.length > 0,
  };
}

/** Pourcentage de critères remplis pour un prospect (0 à 100). */
export function completenessPercent(row: CompletenessRow): number {
  const flags = Object.values(criteriaOf(row));
  return Math.round((100 * flags.filter(Boolean).length) / flags.length);
}

/** Part des prospects dont tous les critères d'un système sont remplis (0 à 100). */
export function systemPercent(rows: CompletenessRow[], system: System): number {
  if (rows.length === 0) return 0;
  const keys = CRITERIA.filter((criterion) => criterion.system === system).map((criterion) => criterion.key);
  const ready = rows.filter((row) => {
    const flags = criteriaOf(row);
    return keys.every((key) => flags[key]);
  });
  return Math.round((100 * ready.length) / rows.length);
}

/** Part des prospects prêts pour le matching : les six critères sont remplis (0 à 100). */
export function matchingPercent(rows: CompletenessRow[]): number {
  if (rows.length === 0) return 0;
  const ready = rows.filter((row) => Object.values(criteriaOf(row)).every(Boolean));
  return Math.round((100 * ready.length) / rows.length);
}
