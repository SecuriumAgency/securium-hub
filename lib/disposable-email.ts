// Domaines d'e-mail jetables ou souvent utilisés par des robots de spear phishing. Liste de suffixes de domaine : un domaine
// est suspect s'il est égal à un suffixe sans le point initial, ou s'il se termine par « .suffixe ».
// Attention : .xyz et .top sont aussi utilisés par des entreprises légitimes. Les rejets sont journalisés (domaine seulement)
// pour que les faux positifs soient repérés. La liste se modifie ici, sans toucher à la logique.
export const DISPOSABLE_SUFFIXES = [
  // Demandés : TLD notoirement utilisés par les bots.
  ".my.id",
  ".xyz",
  ".top",
  ".icu",
  ".wang",
  ".monster",
  // Étendus : TLD gratuits et très exploités pour l'inscription en masse.
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".cyou",
  ".sbs",
  ".click",
  ".buzz",
] as const;

// Domaine de l'adresse, en minuscules, sans point final. Chaîne vide si l'adresse n'a pas de domaine.
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (domain === "") return false;
  return DISPOSABLE_SUFFIXES.some((suffix) => domain === suffix.slice(1) || domain.endsWith(suffix));
}
