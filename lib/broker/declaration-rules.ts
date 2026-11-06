import { z } from "zod";

// Critères déclarés par l'acheteur lui-même, depuis son lien. Module sans dépendance serveur :
// partagé par le formulaire public et par la route qui l'enregistre.

// Métiers proposés. Les clés sont les slugs canoniques stockés dans targetNiches : les formes
// historiques (« couverture », « pac ») sont ramenées sur ces clés par lib/broker/matching.ts.
export const DECLARATION_NICHES = {
  "pompe-a-chaleur": "Pompe à chaleur",
  isolation: "Isolation",
  toiture: "Toiture et couverture",
  "renovation-energetique": "Rénovation énergétique",
  "audit-energetique": "Audit énergétique",
} as const;

export type DeclarationNiche = keyof typeof DECLARATION_NICHES;

export function isDeclarationNiche(value: string): value is DeclarationNiche {
  return Object.prototype.hasOwnProperty.call(DECLARATION_NICHES, value);
}

export const DECLARATION_MAX_ZONES = 50;

// Code postal à 5 chiffres, département à 2 ou 3 chiffres, ou Corse (2A, 2B).
const ZONE = /^(\d{5}|\d{2,3}|2A|2B)$/;

/** Découpe une saisie libre en codes postaux ou départements. Renvoie aussi les valeurs refusées. */
export function parseZones(raw: string): { zones: string[]; invalid: string[] } {
  const items = raw
    .split(/[,;\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const zones = [...new Set(items.filter((item) => ZONE.test(item)))];
  const invalid = [...new Set(items.filter((item) => !ZONE.test(item)))];
  return { zones, invalid };
}

export const DeclarationSchema = z.object({
  token: z.string().min(1).max(500),
  niches: z.array(z.string().max(40)).min(1).max(Object.keys(DECLARATION_NICHES).length),
  zones: z.string().max(1000),
});
