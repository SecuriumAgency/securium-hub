import { initialSites } from "./sites";

export type SiteMetrics = { leadsThisMonth: number; leadsTotal: number };

// Lead tel que renvoyé par GET /api/leads, date sérialisée en ISO.
export type LeadRecord = {
  id: string;
  siteId: string;
  name: string;
  phone: string;
  email: string | null;
  service: string;
  source: string;
  createdAt: string;
};

// Réponse de GET /api/leads.
export type LeadsResponse = {
  // Début du mois courant (minuit, heure de Paris), borne de `leadsThisMonth`.
  monthStart: string;
  metrics: Record<string, SiteMetrics>;
  // Historique complet de la flotte, du plus récent au plus ancien.
  leads: LeadRecord[];
  updatedAt: string;
};

// Corps attendu par POST /api/leads/inbound.
export type InboundLead = {
  siteId: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  source: string;
};

const MAX_LENGTH = { name: 120, phone: 30, email: 254, service: 120, source: 120 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s.()-]{6,}$/;
const siteIds = new Set(initialSites.map((site) => site.id));

export function parseInboundLead(body: unknown): { ok: true; lead: InboundLead } | { ok: false; errors: string[] } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["Le corps doit être un objet JSON."] };
  }
  const input = body as Record<string, unknown>;
  const errors: string[] = [];

  // Champ texte : espaces retirés, chaîne vide traitée comme absente.
  const text = (field: keyof typeof MAX_LENGTH) => {
    const value = input[field];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") {
      errors.push(`${field} doit être une chaîne.`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_LENGTH[field]) errors.push(`${field} dépasse ${MAX_LENGTH[field]} caractères.`);
    return trimmed || undefined;
  };

  const siteId = typeof input.siteId === "string" && siteIds.has(input.siteId) ? input.siteId : undefined;
  const name = text("name");
  const phone = text("phone");
  const email = text("email");
  const service = text("service");
  const source = text("source");

  if (!siteId) errors.push(`siteId inconnu (attendu : ${[...siteIds].join(", ")}).`);
  if (!name) errors.push("name est requis.");
  if (!phone) errors.push("phone est requis.");
  else if (!PHONE.test(phone)) errors.push("phone invalide.");
  if (email && !EMAIL.test(email)) errors.push("email invalide.");
  if (!service) errors.push("service est requis.");
  if (!source) errors.push("source est requis.");

  if (errors.length > 0 || !siteId || !name || !phone || !service || !source) return { ok: false, errors };
  return { ok: true, lead: { siteId, name, phone, email, service, source } };
}
