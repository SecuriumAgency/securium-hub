// Segments B2B du Lead Prospector (Securium-OS/data/leads/b2b-prospects.csv), lus par l'agent Chasseur
// (scripts/agent-chasseur-segments.mts). Une ligne décrit un segment de marché, pas une entreprise : ni
// nom, ni adresse, ni téléphone.
import { readFileSync } from "node:fs";

export type ProspectSegment = {
  // Rang de l'enregistrement dans le fichier, en-tête exclu, pour les messages.
  row: number;
  date: string;
  segment: string;
  secteur: string;
  zone: string;
  taille: string;
  besoin: string;
  canal: string;
  angle: string;
  siteReference: string;
  // Colonne facultative : « Envoyé » ou « Brouillon » sortent la ligne de la rédaction.
  statut: string;
};

type Field = Exclude<keyof ProspectSegment, "row">;

// En-tête du CSV (normalisé par normalize) vers le champ du segment.
const COLUMNS: Record<string, Field> = {
  date: "date",
  segment: "segment",
  secteur: "secteur",
  zone: "zone",
  taille: "taille",
  besoin: "besoin",
  canal: "canal",
  angle_approche: "angle",
  site_reference: "siteReference",
  statut: "statut",
};
const REQUIRED_COLUMNS = ["segment", "secteur", "zone"];
// Statuts normalisés qui excluent une ligne : déjà envoyée, ou accroche déjà rédigée.
const DONE_STATUSES = new Set(["envoye", "brouillon"]);

// Minuscules, sans accents ni espaces autour : « Envoyé » et « envoye » se valent.
export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// CSV : champs entre guillemets possibles, guillemets doublés et sauts de ligne dans les champs.
export function parseCsv(text: string, separator = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

// Segments du fichier. Colonne obligatoire absente : rien n'est lu. Ligne sans segment : écartée et signalée.
export function parseProspectsCsv(
  text: string,
): { ok: true; segments: ProspectSegment[]; skipped: string[] } | { ok: false; errors: string[] } {
  const [header = [], ...records] = parseCsv(text.replace(/^﻿/, ""));
  const fields = header.map((name) => COLUMNS[normalize(name)]);
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.includes(COLUMNS[column]));
  if (missing.length > 0) return { ok: false, errors: missing.map((column) => `colonne « ${column} » absente`) };

  const skipped: string[] = [];
  const segments = records.flatMap((cells, index): ProspectSegment[] => {
    const segment: ProspectSegment = {
      row: index + 1,
      date: "",
      segment: "",
      secteur: "",
      zone: "",
      taille: "",
      besoin: "",
      canal: "",
      angle: "",
      siteReference: "",
      statut: "",
    };
    fields.forEach((field, column) => {
      if (field) segment[field] = (cells[column] ?? "").trim();
    });
    if (!segment.segment) {
      skipped.push(`enregistrement ${segment.row} : segment vide`);
      return [];
    }
    return [segment];
  });
  return { ok: true, segments, skipped };
}

export function readProspectSegments(file: string) {
  return parseProspectsCsv(readFileSync(file, "utf8"));
}

export function segmentKey(segment: Pick<ProspectSegment, "segment" | "secteur" | "zone">) {
  return [segment.segment, segment.secteur, segment.zone].map(normalize).join(" | ");
}

// Segments à rédiger : statut ni « Envoyé » ni « Brouillon », première occurrence de chaque segment.
export function pendingSegments(segments: ProspectSegment[]) {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = segmentKey(segment);
    if (DONE_STATUSES.has(normalize(segment.statut)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
