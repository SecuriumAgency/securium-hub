/*
 * Enrichissement du Lead Broker depuis le registre du prospecteur : téléphone, ville et métier, puis ciblage
 * (niche et zone) déduit par des tables fermées (lib/broker/registry-derivation.ts). Ne remplit que les champs
 * vides : rien n'est écrasé, et relancer le script ne change rien de plus.
 *
 *   npx tsx scripts/enrich-registry.mts            essai à blanc : compte, n'écrit rien
 *   npx tsx scripts/enrich-registry.mts --apply    écrit en base
 *
 * Options : --data=<dossier de prospects.csv et blocklist.json>, par défaut celui de securium-prospector.
 * Exclus : adresses de blocklist.json, lignes Desinscrit, lignes Simulation, clients du broker (isClient).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanVille, departmentFromVille, nicheFromMetier } from "../lib/broker/registry-derivation.ts";
import { isExcludedStatus, isValidEmail, normalizeEmail, normalizeStatus, parseBlocklist, parseIsoDate } from "../lib/outreach.ts";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA = "C:/Users/Utilisateur/Documents/CV/securium-prospector/data";
const apply = process.argv.includes("--apply");
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}
const { prisma } = await import("../lib/prisma.ts");

// CSV du prospecteur : séparateur « ; », champs entre guillemets, guillemets doublés, sauts de ligne dans les champs.
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

const dataDir = option("data") ?? DEFAULT_DATA;
const csvFile = path.join(dataDir, "prospects.csv");
let csvText: string;
try {
  csvText = readFileSync(csvFile, "utf8").replace(/^\uFEFF/, "");
} catch (error) {
  fail(`registre illisible (${csvFile}) : ${(error as Error).message}`);
}
let blocklistData: unknown;
try {
  blocklistData = JSON.parse(readFileSync(path.join(dataDir, "blocklist.json"), "utf8"));
} catch (error) {
  fail(`blocklist illisible : ${(error as Error).message}. Sans elle, un désinscrit pourrait être enrichi.`);
}
const blocklist = new Set(parseBlocklist(blocklistData) ?? fail("blocklist de forme inconnue."));

const [header = [], ...cells] = parseCsv(csvText);
const column = (name: string) => {
  const index = header.indexOf(name);
  if (index === -1) fail(`colonne absente du registre : ${name}`);
  return index;
};
const idx = {
  date: column("Date"),
  email: column("Email"),
  phone: column("Telephone"),
  status: column("Statut"),
  metier: column("Metier"),
  ville: column("Ville"),
};

type Row = { time: number; email: string; phone: string; metier: string; ville: string; status: string };
const rows: Row[] = cells.map((line) => ({
  time: parseIsoDate(line[idx.date])?.getTime() ?? Number.NaN,
  email: normalizeEmail(line[idx.email] ?? ""),
  phone: (line[idx.phone] ?? "").trim(),
  metier: (line[idx.metier] ?? "").trim(),
  ville: (line[idx.ville] ?? "").trim(),
  status: (line[idx.status] ?? "").trim(),
}));

// Désinscrits : adresse en blocklist, ou au moins une ligne Desinscrit. Jamais enrichis (RGPD).
const optedOut = new Set<string>([...blocklist, ...rows.filter((row) => normalizeStatus(row.status) === "desinscrit").map((row) => row.email)]);

const history = new Map<string, Row[]>();
let skippedOptedOut = 0;
let skippedSimulation = 0;
let skippedInvalid = 0;
for (const row of rows) {
  if (optedOut.has(row.email)) skippedOptedOut++;
  else if (isExcludedStatus(row.status)) skippedSimulation++;
  else if (!isValidEmail(row.email) || Number.isNaN(row.time)) skippedInvalid++;
  else history.set(row.email, [...(history.get(row.email) ?? []), row]);
}

// Dernière valeur non vide, dans l'ordre chronologique : même règle que la synchronisation du registre.
function latest(list: Row[], field: "phone" | "metier" | "ville"): string {
  const sorted = [...list].sort((a, b) => a.time - b.time);
  return sorted.findLast((row) => row[field] !== "")?.[field] ?? "";
}
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

type Patch = { phone?: string; city?: string; activity?: string; targetNiches?: string[]; targetZipCodes?: string[] };
const prospects = await prisma.outreachProspect.findMany({
  where: { email: { in: [...history.keys()] } },
  select: { id: true, email: true, company: true, phone: true, city: true, activity: true, targetNiches: true, targetZipCodes: true, isClient: true },
});

const report = {
  prospectsInBase: prospects.length,
  withoutRegistryRow: 0,
  clientsSkipped: 0,
  phoneFilled: 0,
  cityFilled: 0,
  activityFilled: 0,
  targetsConfigured: 0,
  targetsNotDerivable: 0,
};
const unmappedMetier = new Map<string, number>();
const unmappedVille = new Map<string, number>();
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const patches: { id: string; data: Patch }[] = [];

for (const prospect of prospects) {
  const list = history.get(prospect.email);
  if (!list) {
    report.withoutRegistryRow++;
    continue;
  }
  if (prospect.isClient) {
    report.clientsSkipped++;
    continue;
  }
  const phone = latest(list, "phone");
  const ville = cleanVille(latest(list, "ville"));
  const metierRaw = latest(list, "metier");
  const activity = metierRaw ? capitalize(metierRaw) : null;

  const data: Patch = {};
  if (!prospect.phone?.trim() && phone) {
    data.phone = phone;
    report.phoneFilled++;
  }
  if (!prospect.city?.trim() && ville) {
    data.city = ville;
    report.cityFilled++;
  }
  if (!prospect.activity?.trim() && activity) {
    data.activity = activity;
    report.activityFilled++;
  }
  // Ciblage : seulement si les deux critères se déduisent, et seulement s'il est entièrement vide.
  if (prospect.targetNiches.length === 0 && prospect.targetZipCodes.length === 0) {
    const niche = nicheFromMetier(metierRaw);
    const department = departmentFromVille(ville);
    if (niche && department) {
      data.targetNiches = [niche];
      data.targetZipCodes = [department];
      report.targetsConfigured++;
    } else {
      report.targetsNotDerivable++;
      if (!niche) bump(unmappedMetier, metierRaw || "(vide)");
      if (!department) bump(unmappedVille, ville ?? "(vide)");
    }
  }
  if (Object.keys(data).length > 0) patches.push({ id: prospect.id, data });
}

console.log(`Registre : ${csvFile}`);
console.log(`  lignes lues                                : ${rows.length}`);
console.log(`  écartées : désinscrits ${skippedOptedOut}, simulations ${skippedSimulation}, invalides ${skippedInvalid}`);
console.log(`Base : ${report.prospectsInBase} prospect(s) trouvé(s) dans le registre par e-mail`);
console.log(`  sans ligne au registre                     : ${report.withoutRegistryRow}`);
console.log(`  clients du broker, non touchés             : ${report.clientsSkipped}`);
console.log(`  téléphone à compléter                      : ${report.phoneFilled}`);
console.log(`  ville à compléter                          : ${report.cityFilled}`);
console.log(`  métier à compléter                         : ${report.activityFilled}`);
console.log(`  ciblage configuré (niche + zone)           : ${report.targetsConfigured}`);
console.log(`  ciblage non déductible (rester sans cible) : ${report.targetsNotDerivable}`);
console.log(`  métiers hors niches vendues : ${JSON.stringify([...unmappedMetier.entries()])}`);
console.log(`  villes sans département    : ${JSON.stringify([...unmappedVille.entries()])}`);
console.log(`Mises à jour à écrire : ${patches.length} prospect(s)`);

if (!apply) {
  console.log("Essai à blanc : rien n'est écrit. Relancer avec --apply pour écrire.");
  await prisma.$disconnect();
  process.exit(0);
}

try {
  await prisma.$transaction(patches.map((patch) => prisma.outreachProspect.update({ where: { id: patch.id }, data: patch.data })));
  console.log(`Écrit : ${patches.length} prospect(s) mis à jour, en une seule transaction.`);
} catch (error) {
  console.error("ERREUR : écriture annulée, rien n'est modifié :", error instanceof Error ? error.message : "erreur inconnue");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
