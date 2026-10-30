// Import CSV de prospects (POST /api/outreach/import, Content-Type text/csv) : une ligne par entreprise.
// company et email sont requis ; phone, city et activity sont facultatifs. Chaque ligne passe par Zod avant
// toute écriture. Comme le registre (lib/outreach.ts), le lot est rejeté en entier à la moindre erreur,
// doublon dans le fichier compris, pour qu'un import ne soit jamais partiel en silence.
import { z } from "zod";
import { MAX_BATCH, normalizeEmail } from "./outreach";
import { normalize, parseCsv } from "./prospects-parser";

// Source d'un prospect importé par CSV, à la place de « securium-prospector ».
export const CSV_SOURCE = "import-csv";

// Champ du Hub et intitulés acceptés dans l'en-tête, en minuscules sans accents (comparés après normalize).
const HEADERS = {
  company: ["company", "entreprise", "societe", "raison sociale"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "telephone", "tel"],
  city: ["city", "ville"],
  activity: ["activity", "activite", "secteur"],
} as const;
type LeadField = keyof typeof HEADERS;
const FIELDS = Object.keys(HEADERS) as LeadField[];
const REQUIRED: LeadField[] = ["company", "email"];
const MAX_ERRORS = 20;

// Texte facultatif : espaces retirés, vide ramené à null.
const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} dépasse ${max} caractères`)
    .transform((value) => value || null);

// Une ligne du CSV, valide ou rejetée. L'adresse est normalisée (minuscules, partie adresse seule) avant contrôle.
export const leadRowSchema = z.object({
  company: z.string().trim().min(1, "company est requis").max(200, "company dépasse 200 caractères"),
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("email mal formé").max(254, "email dépasse 254 caractères")),
  phone: optional(40, "phone"),
  city: optional(100, "city"),
  activity: optional(200, "activity"),
});

export type LeadInput = z.infer<typeof leadRowSchema>;

export type LeadParse = { ok: true; leads: LeadInput[] } | { ok: false; errors: string[] };

// « ; » quand l'en-tête en contient et pas de virgule (export Excel en français), « , » sinon.
function separatorOf(text: string) {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return header.includes(";") && !header.includes(",") ? ";" : ",";
}

// Lignes du fichier, en-tête exclu. Colonne requise absente : rien n'est lu. Toute erreur rejette le lot.
export function parseLeadCsv(text: string): LeadParse {
  const [header = [], ...records] = parseCsv(text.replace(/^﻿/, ""), separatorOf(text));
  const columns = new Map<LeadField, number>();
  header.forEach((name, index) => {
    const field = FIELDS.find((key) => (HEADERS[key] as readonly string[]).includes(normalize(name)));
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const missing = REQUIRED.filter((field) => !columns.has(field));
  if (missing.length > 0) return { ok: false, errors: missing.map((field) => `colonne « ${field} » absente`) };
  if (records.length === 0) return { ok: false, errors: ["Fichier sans ligne sous l'en-tête."] };
  if (records.length > MAX_BATCH) return { ok: false, errors: [`au plus ${MAX_BATCH} lignes par fichier (reçu : ${records.length}).`] };

  const errors: string[] = [];
  const leads: LeadInput[] = [];
  const rowOfEmail = new Map<string, number>();
  records.forEach((cells, index) => {
    const at = `enregistrement ${index + 1}`;
    const value = (field: LeadField) => {
      const column = columns.get(field);
      return column === undefined ? "" : (cells[column] ?? "");
    };
    const parsed = leadRowSchema.safeParse({
      company: value("company"),
      email: value("email"),
      phone: value("phone"),
      city: value("city"),
      activity: value("activity"),
    });
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `${at} : ${issue.message}.`));
      return;
    }
    const earlier = rowOfEmail.get(parsed.data.email);
    if (earlier !== undefined) {
      errors.push(`${at} : email déjà présent à l'enregistrement ${earlier}.`);
      return;
    }
    rowOfEmail.set(parsed.data.email, index + 1);
    leads.push(parsed.data);
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS);
    if (errors.length > MAX_ERRORS) shown.push(`… et ${errors.length - MAX_ERRORS} autre(s) erreur(s).`);
    return { ok: false, errors: shown };
  }
  return { ok: true, leads };
}
