// Déduction du métier et du département à partir du registre du prospecteur. Tables fermées : une valeur
// absente de ces tables n'est jamais devinée, elle reste sans configuration. Module pur, sans dépendance.

// Métiers du registre → niche du broker. « chauffagiste » → pompe à chaleur est une hypothèse : un
// chauffagiste n'installe pas toujours de PAC. Elle est signalée dans le rapport du script d'enrichissement.
const METIER_NICHES = new Map<string, string>([
  ["couvreur", "toiture"],
  ["couverture", "toiture"],
  ["toiture", "toiture"],
  ["zingueur", "toiture"],
  ["chauffagiste", "pompe-a-chaleur"],
]);

// Villes du registre → département. Une région (Île-de-France, Occitanie…) ne désigne pas un département
// unique : elle n'est pas dans la table, donc pas de zone déduite.
const VILLE_DEPARTMENTS = new Map<string, string>([
  ["montigny-les-cormeilles", "95"],
  ["cergy", "95"],
  ["argenteuil", "95"],
  ["sartrouville", "78"],
  ["hauts-de-seine", "92"],
]);

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Ville sans son suffixe pays du registre : « Cergy, France » devient « Cergy ». */
export function cleanVille(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/,\s*France$/i, "").trim();
  return value.length > 0 ? value : null;
}

/** Niche du broker pour un métier du registre, ou null si le métier ne correspond à aucune niche vendue. */
export function nicheFromMetier(raw: string | null | undefined): string | null {
  return METIER_NICHES.get(fold(raw ?? "")) ?? null;
}

/** Département pour une ville du registre, ou null si la ville est absente de la table (régions comprises). */
export function departmentFromVille(raw: string | null | undefined): string | null {
  const city = cleanVille(raw);
  return city ? (VILLE_DEPARTMENTS.get(fold(city)) ?? null) : null;
}
