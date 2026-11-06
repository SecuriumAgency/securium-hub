import { isExcludedStatus, isValidEmail, NEW_STATUS, normalizeEmail } from "./outreach";
import { isPrescriberActivity, isRoofingTrade, PRESCRIBER_SOURCE } from "./chasseur";

// Import sécurisé des prescripteurs B2B (syndics, agences immobilières, architectes, promoteurs).
// Module pur : la lecture de la base et les écritures sont faites par scripts/import-prescribers.mts.

/** Découpe un CSV. Le séparateur est lu sur l'en-tête : « ; » (Excel FR) ou « , ». Guillemets et sauts de ligne gérés. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      cells.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length > 0) {
    row.push(field);
    cells.push(row);
  }
  const nonEmpty = cells.filter((line) => line.some((cell) => cell.trim() !== ""));
  const [headerRow = [], ...body] = nonEmpty;
  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const rows = body.map((line) => Object.fromEntries(headers.map((header, index) => [header, (line[index] ?? "").trim()])));
  return { headers, rows };
}

export type ExistingProspect = { id: string; status: string; company: string; phone: string | null; city: string | null; activity: string | null };
export type PlanContext = { blocklist: ReadonlySet<string>; existing: ReadonlyMap<string, ExistingProspect>; now: Date };

export type Creation = {
  line: number;
  company: string;
  activity: string;
  data: { company: string; email: string; phone: string | null; city: string | null; activity: string; status: string; source: string; createdAt: Date; lastContactAt: Date };
};
export type Completion = { line: number; company: string; id: string; data: { phone?: string; city?: string; activity?: string; company?: string } };
export type Rejection = { line: number; label: string; reason: string };
export type Plan = { creates: Creation[]; completions: Completion[]; unchanged: number; rejections: Rejection[]; addressIgnored: boolean };

/**
 * Décide, ligne par ligne, quoi faire. Un prescripteur doit avoir un métier qui contient un mot-clé obligatoire
 * et ne pas être de la toiture ; un désinscrit ou une adresse en blocklist n'est jamais touché.
 * Un prescripteur déjà en base n'a pas son statut modifié : seuls ses champs vides sont complétés.
 * Un nouveau prescripteur entre en statut « Nouveau », sans historique de contact : c'est vrai, il n'a jamais été
 * contacté. L'icebreaker l'ignore (lib/outreach-ai.ts) et le Chasseur lui rédige le premier email (isImportedPrescriber).
 */
export function planImport(rows: Record<string, string>[], headers: string[], ctx: PlanContext): Plan {
  const plan: Plan = { creates: [], completions: [], unchanged: 0, rejections: [], addressIgnored: headers.includes("address") && rows.some((row) => (row.address ?? "") !== "") };
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2; // ligne 1 = en-tête
    const company = (row.company ?? "").trim();
    const label = company || `(sans nom)`;
    const reject = (reason: string) => plan.rejections.push({ line, label, reason });
    const email = normalizeEmail(row.email ?? "");
    const metier = (row.metier ?? "").trim();
    const phone = (row.phone ?? "").trim() || null;
    const city = (row.city ?? "").trim() || null;

    if (!company) return reject("entreprise manquante");
    if (!email || !isValidEmail(email)) return reject("e-mail invalide");
    if (seen.has(email)) return reject("doublon dans le fichier");
    seen.add(email);
    if (!metier) return reject("métier manquant");
    if (!isPrescriberActivity(metier)) return reject("métier hors cible : aucun mot-clé obligatoire (syndic, immobili, architect, promot, locati)");
    if (isRoofingTrade({ activity: metier, targetNiches: [] })) return reject("métier de la toiture, hors cible du Chasseur");
    if (ctx.blocklist.has(email)) return reject("adresse en blocklist (désinscrit)");

    const known = ctx.existing.get(email);
    if (known) {
      if (isExcludedStatus(known.status)) return reject("désinscrit ou simulation en base");
      const data: Completion["data"] = {};
      if (!known.phone?.trim() && phone) data.phone = phone;
      if (!known.city?.trim() && city) data.city = city;
      if (!known.activity?.trim()) data.activity = metier;
      if (!known.company.trim()) data.company = company;
      if (Object.keys(data).length > 0) plan.completions.push({ line, company, id: known.id, data });
      else plan.unchanged++;
      return;
    }

    plan.creates.push({
      line,
      company,
      activity: metier,
      data: { company, email, phone, city, activity: metier, status: NEW_STATUS, source: PRESCRIBER_SOURCE, createdAt: ctx.now, lastContactAt: ctx.now },
    });
  });

  return plan;
}
