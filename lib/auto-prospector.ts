import { isPrescriberActivity, isRoofingTrade } from "./chasseur";
import { isValidEmail } from "./outreach";

// Prospection automatisée (OSINT) des prescripteurs B2B. Module pur : aucun appel réseau ni écriture ici.
// Les appels (Overpass, sites web, base) sont faits par scripts/auto-prospector.mts.

/** Zone d'intervention de Géo Energie Habitat : l'Île-de-France, soit les huit départements de lib/broker/partners.ts. */
export const ZONE_LABEL = "Île-de-France";

export type ProspectQuery = { label: string; selectors: string[] };

// Les quatre métiers visés. Chaque sélecteur est un filtre de tags OpenStreetMap, appliqué dans la zone.
export const PROSPECT_QUERIES: ProspectQuery[] = [
  { label: "Syndic de copropriété", selectors: ['["office"="property_management"]', '["name"~"syndic",i]'] },
  { label: "Agence immobilière", selectors: ['["office"="estate_agent"]'] },
  { label: "Architecte", selectors: ['["office"="architect"]', '["name"~"architect",i]'] },
  { label: "Promoteur immobilier", selectors: ['["office"="company"]["name"~"promot",i]'] },
];

/** Requête Overpass (OpenStreetMap) pour une liste de sélecteurs, limitée à la zone. */
export function overpassQuery(selectors: string[]) {
  return [
    "[out:json][timeout:90];",
    `area["name"="${ZONE_LABEL}"]["admin_level"="4"]->.zone;`,
    "(",
    ...selectors.map((selector) => `  nwr(area.zone)${selector};`),
    ");",
    "out center tags;",
  ].join("\n");
}

/** Élément tel que le renvoie Overpass avec « out center tags ». */
export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
};

/** Résultat d'une recherche, avant filtre de sécurité. Le métier est déduit des tags, ou null s'il n'est pas reconnu. */
export type Candidate = {
  company: string;
  metier: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  osmRef: string;
};

const fold = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Écoles, ministères et syndicats : des noms qui contiennent « architecture » ou « syndic » sans être des prescripteurs.
// « Syndicat » n'est pas un syndic : le mot est cherché entier (« syndic », « syndics »).
const NOT_A_PROSPECT = /ecole|universit|lycee|ministere|prefecture|syndicat|syndicale|syndical|conseil d'architecture/;
const SYNDIC_WORD = /\bsyndics?\b/;

/** Métier déduit des tags OSM, dans les mots du registre. Null si le résultat n'est pas un prescripteur visé. */
export function classifyMetier(tags: Record<string, string>): string | null {
  const name = fold(tags.name);
  if (NOT_A_PROSPECT.test(name)) return null;
  if (tags.office === "property_management" || SYNDIC_WORD.test(name)) return "Syndic de copropriété";
  if (tags.office === "estate_agent") return "Agence immobilière";
  if (tags.office === "architect" || name.includes("architect")) return "Architecte";
  if (name.includes("promot")) return "Promoteur immobilier";
  return null;
}

const clean = (value: string | undefined) => (value ?? "").trim() || null;

/** Élément OSM devenu candidat, ou null s'il n'a pas de nom. */
export function toCandidate(element: OsmElement): Candidate | null {
  const tags = element.tags ?? {};
  const company = clean(tags.name);
  if (!company) return null;
  return {
    company,
    metier: classifyMetier(tags),
    city: clean(tags["addr:city"]),
    phone: clean(tags.phone) ?? clean(tags["contact:phone"]),
    email: clean(tags.email) ?? clean(tags["contact:email"]),
    website: clean(tags.website) ?? clean(tags["contact:website"]) ?? clean(tags.url),
    osmRef: `${element.type}/${element.id}`,
  };
}

/**
 * Filtre de sécurité d'un métier, avant toute visite de site. Renvoie la raison du rejet, ou null si le métier est retenu.
 * Même règle que l'import CSV (lib/prescribers-import.ts) : mot-clé obligatoire, toiture exclue.
 */
export function screenMetier(metier: string | null): string | null {
  if (!metier) return "métier non reconnu";
  if (isRoofingTrade({ activity: metier, targetNiches: [] })) return "métier de la toiture";
  if (!isPrescriberActivity(metier)) return "hors prescripteurs";
  return null;
}

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const NOT_A_CONTACT = /\.(png|jpe?g|gif|svg|webp|css|js)$|^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster)@|sentry|wixpress|\.test$/i;

/**
 * Adresses e-mail d'une page, sans images ni robots. Celles du domaine du site passent en premier : ce sont
 * les adresses de l'entreprise, pas celles d'un prestataire (agence web, hébergeur).
 */
export function extractEmails(html: string, siteHost: string): string[] {
  const host = siteHost.toLowerCase().replace(/^www\./, "");
  const found = [...new Set((html.match(EMAIL_IN_TEXT) ?? []).map((email) => email.toLowerCase()))]
    .filter((email) => isValidEmail(email) && !NOT_A_CONTACT.test(email));
  const ownSite = (email: string) => {
    const domain = email.split("@")[1] ?? "";
    return domain === host || domain.endsWith(`.${host}`);
  };
  return [...found.filter(ownSite), ...found.filter((email) => !ownSite(email))];
}

/** Jeu de test de la même forme qu'Overpass. Jamais écrit en base : réservé aux essais à blanc. */
export function mockElements(): { label: string; element: OsmElement }[] {
  return [
    {
      label: "Syndic de copropriété",
      element: { type: "node", id: 1, tags: { name: "Cabinet Syndic Test Nord", office: "property_management", "addr:city": "Cergy", email: "contact@syndic-test.example.org", phone: "01 00 00 00 01" } },
    },
    {
      label: "Agence immobilière",
      element: { type: "node", id: 2, tags: { name: "Agence Test Sartrouville", office: "estate_agent", "addr:city": "Sartrouville", email: "accueil@agence-test.example.org" } },
    },
    {
      label: "Architecte",
      element: { type: "node", id: 3, tags: { name: "Atelier Architecte Test", office: "architect", "addr:city": "Pontoise", phone: "01 00 00 00 03" } },
    },
    {
      label: "Promoteur immobilier",
      element: { type: "way", id: 4, tags: { name: "Promotion Test Immo", office: "company", "addr:city": "Nanterre", email: "bureau@promotion-test.example.org" } },
    },
    {
      label: "Agence immobilière",
      element: { type: "node", id: 5, tags: { name: "Plomberie Test", craft: "plumber", email: "plomb@test.example.org" } },
    },
  ];
}
