/*
 * Migration de l'historique de prospection (securium-prospector) vers le Hub.
 *
 *   node scripts/migrate-outreach.mts            essai à blanc : compte les prospects prêts, n'envoie rien
 *   node scripts/migrate-outreach.mts --send     envoie les prospects à POST /api/outreach/import
 *
 * Options : --data=<dossier> (prospects.csv et blocklist.json, par défaut le dossier data/ de
 * securium-prospector), --hub=<url> (par défaut https://hub.securium-agency.fr ; HTTP accepté vers la
 * machine locale seulement). Clé : HUB_SECRET_KEY, de l'environnement ou de .env.local puis .env du Hub.
 *
 * Le registre prospects.csv journalise des actions (envoi, relance…) : plusieurs lignes par
 * prospect. Le script les regroupe par adresse : premier contact (createdAt), dernière action
 * (lastContactAt), dernier statut, entreprise et téléphone les plus récents.
 *
 * RGPD : un prospect désinscrit (statut Desinscrit sur une de ses lignes, ou adresse dans
 * blocklist.json) est écarté en entier, toutes ses lignes comprises. Les lignes Simulation (essais à
 * blanc du prospecteur, sans contact réel) sont écartées une à une. Seuls l'entreprise, l'adresse,
 * le téléphone, le statut et les dates sont transmis. Sans blocklist lisible, rien ne part.
 *
 * TypeScript exécuté tel quel par Node (suppression des types) et vérifié par npm run typecheck.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isExcludedStatus,
  MAX_BATCH,
  normalizeEmail,
  normalizeStatus,
  parseIsoDate,
  parseOutreachBatch,
  type OutreachProspectInput,
} from "../lib/outreach.ts";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA = "C:/Users/Utilisateur/Documents/CV/securium-prospector/data";
const DEFAULT_HUB = "https://hub.securium-agency.fr";
const SOURCE = "securium-prospector";
const REQUIRED_COLUMNS = ["Date", "Entreprise", "Email", "Telephone", "Statut"] as const;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TIMEOUT_MS = 30_000;

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const send = process.argv.includes("--send");
const dataDir = option("data") ?? DEFAULT_DATA;

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

// CSV du prospecteur : séparateur « ; » (Excel FR), champs entre guillemets possibles, guillemets
// doublés et sauts de ligne dans les champs.
function parseCsv(text: string): string[][] {
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
    else if (char === ";") {
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

// Trois formes acceptées, comme dans securium-prospector : ["a@b.fr"], [{ email }], { entries: [{ email }] }.
function readBlocklist(file: string): Set<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`blocklist illisible (${file}) : ${(error as Error).message}. Sans elle, des désinscrits pourraient être importés.`);
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : fail(`blocklist de forme inconnue (${file}).`);
  return new Set(
    entries
      .map((entry) => (typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? (entry as { email?: unknown }).email : null))
      .filter((email): email is string => typeof email === "string" && email.trim() !== "")
      .map(normalizeEmail),
  );
}

type Row = { date: number; company: string; email: string; phone: string; status: string };

const csvFile = path.join(dataDir, "prospects.csv");
let csvText: string;
try {
  csvText = readFileSync(csvFile, "utf8").replace(/^\uFEFF/, "");
} catch (error) {
  fail(`registre illisible (${csvFile}) : ${(error as Error).message}`);
}
const blocklist = readBlocklist(path.join(dataDir, "blocklist.json"));

const [header = [], ...cells] = parseCsv(csvText);
const columns = Object.fromEntries(REQUIRED_COLUMNS.map((name) => [name, header.indexOf(name)])) as Record<(typeof REQUIRED_COLUMNS)[number], number>;
const missing = REQUIRED_COLUMNS.filter((name) => columns[name] === -1);
if (missing.length > 0) fail(`colonnes absentes du registre : ${missing.join(", ")}.`);

// Date hors ISO 8601 : ligne écartée plutôt que lue de travers (NaN, comptée comme incomplète).
const rows: Row[] = cells.map((line) => ({
  date: parseIsoDate(line[columns.Date])?.getTime() ?? NaN,
  company: (line[columns.Entreprise] ?? "").trim(),
  email: normalizeEmail(line[columns.Email] ?? ""),
  phone: (line[columns.Telephone] ?? "").trim(),
  status: (line[columns.Statut] ?? "").trim(),
}));

// Désinscrits : adresse en blocklist, ou au moins une ligne Desinscrit. Écartés en entier.
const optedOut = new Set([...blocklist, ...rows.filter((row) => normalizeStatus(row.status) === "desinscrit").map((row) => row.email)]);

const stats = { rows: rows.length, optedOutRows: 0, simulationRows: 0, invalidRows: 0 };
const byEmail = new Map<string, Row[]>();
for (const row of rows) {
  if (optedOut.has(row.email)) stats.optedOutRows++;
  else if (isExcludedStatus(row.status)) stats.simulationRows++;
  else if (!row.email || Number.isNaN(row.date) || !row.status) stats.invalidRows++;
  else byEmail.set(row.email, [...(byEmail.get(row.email) ?? []), row]);
}

const latest = (history: Row[], field: "company" | "phone") => history.findLast((row) => row[field] !== "")?.[field] ?? "";
const prospects: OutreachProspectInput[] = [...byEmail].map(([email, history]) => {
  history.sort((a, b) => a.date - b.date);
  return {
    company: latest(history, "company"),
    email,
    phone: latest(history, "phone") || null,
    status: history[history.length - 1].status,
    source: SOURCE,
    createdAt: new Date(history[0].date).toISOString(),
    lastContactAt: new Date(history[history.length - 1].date).toISOString(),
  };
});

// Même validation que la route, lot par lot : ce qui passe ici sera accepté par le Hub.
const batches: OutreachProspectInput[][] = [];
for (let i = 0; i < prospects.length; i += MAX_BATCH) batches.push(prospects.slice(i, i + MAX_BATCH));
for (const [index, batch] of batches.entries()) {
  const checked = parseOutreachBatch(batch);
  if (!checked.ok) fail(`lot ${index + 1} refusé par la validation de la route :\n  ${checked.errors.join("\n  ")}`);
}

const statuses = prospects.reduce<Record<string, number>>((acc, prospect) => ((acc[prospect.status] = (acc[prospect.status] ?? 0) + 1), acc), {});
const ignoredBlocklisted = [...blocklist].filter((email) => !rows.some((row) => row.email === email)).length;
console.log(`Registre : ${csvFile}`);
console.log(`  lignes lues                               : ${stats.rows}`);
console.log(`  lignes de prospects désinscrits écartées  : ${stats.optedOutRows} (${optedOut.size - ignoredBlocklisted} adresse(s) concernée(s) ; blocklist : ${blocklist.size})`);
console.log(`  lignes Simulation écartées                : ${stats.simulationRows}`);
console.log(`  lignes incomplètes écartées               : ${stats.invalidRows}`);
console.log(`Prospects prêts à importer                  : ${prospects.length}, en ${batches.length} lot(s), validés par les règles de la route`);
console.log(`  par dernier statut : ${Object.entries(statuses).map(([status, count]) => `${status} ${count}`).join(", ")}`);
if (prospects.length > 0) {
  const first = prospects.reduce((min, prospect) => (prospect.createdAt < min ? prospect.createdAt : min), prospects[0].createdAt);
  const last = prospects.reduce((max, prospect) => (prospect.lastContactAt > max ? prospect.lastContactAt : max), prospects[0].lastContactAt);
  console.log(`  période : ${first} → ${last}`);
}

if (!send) {
  console.log("Essai à blanc : rien n'a été envoyé. Relancer avec --send pour importer.");
  process.exit(0);
}

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}
const key = process.env.HUB_SECRET_KEY ?? fail("HUB_SECRET_KEY introuvable (environnement, .env.local, .env).");
let url: URL;
try {
  url = new URL("/api/outreach/import", option("hub") ?? DEFAULT_HUB);
} catch {
  fail(`URL du Hub invalide : ${option("hub")}`);
}
// La clé part dans l'en-tête : jamais en clair hors de la machine locale.
if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname))) {
  fail(`HTTPS requis hors de la machine locale (${url.href}).`);
}

let inserted = 0;
let skipped = 0;
for (const [index, batch] of batches.entries()) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(batch),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { inserted?: number; skipped?: number; error?: string; details?: string[] } | null;
  if (response.status !== 201) {
    fail(`lot ${index + 1}/${batches.length} refusé, HTTP ${response.status} ${body?.error ?? ""}${body?.details ? `\n  ${body.details.join("\n  ")}` : ""}`);
  }
  inserted += body?.inserted ?? 0;
  skipped += body?.skipped ?? 0;
  console.log(`lot ${index + 1}/${batches.length} : ${body?.inserted ?? 0} importé(s), ${body?.skipped ?? 0} déjà présent(s)`);
}
console.log(`Import terminé vers ${url.origin} : ${inserted} prospect(s) importé(s), ${skipped} déjà présent(s).`);
