// Prospection sortante : prospects démarchés par securium-prospector, synchronisés dans le Hub par
// scripts/migrate-outreach.mts (POST /api/outreach/import) et affichés sur /admin/outreach.
// Aucun import : le script de synchronisation, exécuté par Node sans bundler, réutilise ces règles telles quelles.

// Prospect tel que l'envoie le script, dates en ISO.
export type OutreachProspectInput = {
  company: string;
  email: string;
  phone: string | null;
  status: string;
  source: string;
  createdAt: string;
  lastContactAt: string;
};

// Corps de POST /api/outreach/import : prospects à créer ou mettre à jour, et adresses désinscrites
// à purger du Hub.
export type OutreachBatchInput = {
  prospects: OutreachProspectInput[];
  unsubscribedEmails: string[];
};

// Prospect validé, prêt pour prisma.outreachProspect.upsert.
export type OutreachProspectRecord = Omit<OutreachProspectInput, "createdAt" | "lastContactAt"> & {
  createdAt: Date;
  lastContactAt: Date;
};

// Par requête : au plus 500 prospects (un upsert chacun, dans une seule transaction) et 5 000
// adresses à purger. Le corps reste loin de la limite de 4,5 Mo de Vercel.
export const MAX_BATCH = 500;
export const MAX_UNSUBSCRIBED = 5000;

const MAX_LENGTH = { company: 200, email: 254, phone: 40, status: 40, source: 60 } as const;
const MAX_ERRORS = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Comparaison sans casse ni accents : « Désinscrit » et « desinscrit » sont le même statut.
export function normalizeStatus(status: string) {
  return status.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Jamais importés : une désinscription est une opposition définitive (RGPD), et une simulation
// un essai à blanc du prospecteur, sans contact réel.
const EXCLUDED_STATUSES = new Set(["desinscrit", "simulation"]);

export function isExcludedStatus(status: string) {
  return EXCLUDED_STATUSES.has(normalizeStatus(status));
}

// Mêmes règles que normalizeEmail de securium-prospector : minuscules, et seule la partie adresse
// est gardée (d'anciennes lignes du registre contiennent du HTML scrappé, ex. « >nom@domaine.fr »).
export function normalizeEmail(email: string) {
  const lowered = email.trim().toLowerCase();
  return lowered.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/)?.[0] ?? lowered;
}

// Adresse déjà normalisée.
export function isValidEmail(email: string) {
  return EMAIL.test(email) && email.length <= MAX_LENGTH.email;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ISO 8601 avec fuseau seulement : Date.parse accepte aussi « 02/09/2026 », qu'il lit au format
// américain (9 février), et fausserait l'historique en silence.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseIsoDate(value: unknown) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

// Tout ou rien : une seule entrée invalide fait rejeter le lot, pour qu'une synchronisation ne soit
// jamais partielle en silence. Une adresse ne peut pas être à la fois à créer et à purger.
export function parseOutreachBatch(
  body: unknown,
): { ok: true; prospects: OutreachProspectRecord[]; unsubscribedEmails: string[] } | { ok: false; errors: string[] } {
  if (!isRecord(body) || !Array.isArray(body.prospects) || !Array.isArray(body.unsubscribedEmails)) {
    return { ok: false, errors: ["Le corps doit être un objet { prospects: [...], unsubscribedEmails: [...] }."] };
  }
  const { prospects: rawProspects, unsubscribedEmails: rawUnsubscribed } = body;
  if (rawProspects.length > MAX_BATCH) {
    return { ok: false, errors: [`prospects : au plus ${MAX_BATCH} par lot (reçu : ${rawProspects.length}).`] };
  }
  if (rawUnsubscribed.length > MAX_UNSUBSCRIBED) {
    return { ok: false, errors: [`unsubscribedEmails : au plus ${MAX_UNSUBSCRIBED} par lot (reçu : ${rawUnsubscribed.length}).`] };
  }
  if (rawProspects.length === 0 && rawUnsubscribed.length === 0) {
    return { ok: false, errors: ["Lot vide : aucun prospect ni aucune adresse à purger."] };
  }

  const errors: string[] = [];

  const unsubscribed = new Set<string>();
  rawUnsubscribed.forEach((value, index) => {
    const email = typeof value === "string" ? normalizeEmail(value) : "";
    if (!email || !isValidEmail(email)) errors.push(`unsubscribedEmails[${index}] invalide.`);
    else unsubscribed.add(email);
  });

  const seen = new Set<string>();
  const prospects: OutreachProspectRecord[] = [];
  rawProspects.forEach((item, index) => {
    const at = `prospects[${index}]`;
    const before = errors.length;
    if (!isRecord(item)) {
      errors.push(`${at} doit être un objet.`);
      return;
    }
    // Champ texte requis : espaces retirés, longueur bornée.
    const text = (field: "company" | "status" | "source") => {
      const value = typeof item[field] === "string" ? (item[field] as string).trim() : "";
      if (!value) errors.push(`${at}.${field} est requis.`);
      else if (value.length > MAX_LENGTH[field]) errors.push(`${at}.${field} dépasse ${MAX_LENGTH[field]} caractères.`);
      return value;
    };

    const company = text("company");
    const status = text("status");
    const source = text("source");
    if (status && isExcludedStatus(status)) errors.push(`${at}.status « ${status} » n'est jamais importé (désinscription ou simulation).`);

    const email = typeof item.email === "string" ? normalizeEmail(item.email) : "";
    if (!email || !isValidEmail(email)) errors.push(`${at}.email invalide.`);
    else if (seen.has(email)) errors.push(`${at}.email en double dans le lot.`);
    else if (unsubscribed.has(email)) errors.push(`${at}.email figure aussi dans unsubscribedEmails.`);
    seen.add(email);

    const rawPhone = typeof item.phone === "string" ? item.phone.trim() : "";
    if (item.phone !== undefined && item.phone !== null && typeof item.phone !== "string") errors.push(`${at}.phone doit être une chaîne ou null.`);
    else if (rawPhone.length > MAX_LENGTH.phone) errors.push(`${at}.phone dépasse ${MAX_LENGTH.phone} caractères.`);

    const createdAt = parseIsoDate(item.createdAt);
    const lastContactAt = parseIsoDate(item.lastContactAt);
    if (!createdAt) errors.push(`${at}.createdAt doit être une date ISO.`);
    if (!lastContactAt) errors.push(`${at}.lastContactAt doit être une date ISO.`);
    else if (createdAt && lastContactAt < createdAt) errors.push(`${at}.lastContactAt précède createdAt.`);

    if (errors.length === before && createdAt && lastContactAt) {
      prospects.push({ company, email, phone: rawPhone || null, status, source, createdAt, lastContactAt });
    }
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS);
    if (errors.length > MAX_ERRORS) shown.push(`… et ${errors.length - MAX_ERRORS} autre(s) erreur(s).`);
    return { ok: false, errors: shown };
  }
  return { ok: true, prospects, unsubscribedEmails: [...unsubscribed] };
}
