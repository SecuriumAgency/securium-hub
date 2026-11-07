/*
 * Prospection automatisée des prescripteurs B2B (syndics, agences immobilières, architectes, promoteurs) en
 * Île-de-France, zone de Géo Energie Habitat. Source : OpenStreetMap via Overpass (sans clé d'API).
 * Google Places n'est pas branché : aucune clé n'est définie dans l'environnement.
 *
 *   npx tsx scripts/auto-prospector.mts                  essai à blanc (par défaut) : interroge, filtre, n'écrit rien
 *   npx tsx scripts/auto-prospector.mts --apply          écrit en base, en une seule transaction
 *   npx tsx scripts/auto-prospector.mts --source=mock    jeu de test structuré ; refusé avec --apply
 *   Option --sites=<n> : nombre maximum de sites web visités pour y trouver un e-mail (défaut 40).
 *
 * Chaque résultat passe le filtre de sécurité de l'import CSV (lib/prescribers-import.ts) : métier obligatoire,
 * toiture exclue, blocklist, doublon en base. Un prospect valide entre au statut « Nouveau », sans icebreaker : le
 * Chasseur lui rédige le premier email, en brouillon à valider sur /admin/outreach. Rien n'est envoyé sans validation.
 * Un résultat sans e-mail n'est pas écrit : le registre est indexé par e-mail.
 * Sites visités : robots.txt respecté (un « Disallow: / » arrête la visite), une page d'accueil puis /contact,
 * une requête à la fois. Les e-mails ne sont jamais affichés dans les logs.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROSPECT_QUERIES,
  ZONE_LABEL,
  extractEmails,
  mockElements,
  overpassQuery,
  screenMetier,
  toCandidate,
  type Candidate,
  type OsmElement,
  type ProspectQuery,
} from "../lib/auto-prospector.ts";
import { planImport, type Plan } from "../lib/prescribers-import.ts";
import { normalizeEmail } from "../lib/outreach.ts";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");
const source = option("source") ?? "overpass";
const siteLimit = Number(option("sites") ?? 40);
const SOURCE_TAG = "auto-prospector-osm";
const USER_AGENT = "SecuriumHubProspector/1.0";
const HEADERS = ["company", "email", "phone", "city", "metier"];

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

if (source !== "overpass" && source !== "mock") fail(`source inconnue : ${source} (overpass ou mock).`);
if (apply && source === "mock") fail("le jeu de test ne s'écrit jamais en base.");
if (!Number.isInteger(siteLimit) || siteLimit < 0) fail("--sites doit être un entier positif ou nul.");
const mode = apply ? "apply" : "dry-run";

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  const full = path.join(HUB_ROOT, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const { prisma } = await import("../lib/prisma.ts");

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Requête Overpass pour un métier : les éléments OpenStreetMap de la zone. */
async function overpass(query: ProspectQuery): Promise<OsmElement[]> {
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", overpassQuery(query.selectors));
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Overpass a répondu ${response.status}`);
  const body = (await response.json()) as { elements?: OsmElement[] };
  return body.elements ?? [];
}

async function fetchText(url: URL, timeoutMs = 8_000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.text()).slice(0, 1_000_000);
  } catch {
    return null;
  }
}

function siteUrl(website: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return null;
  }
}

/** E-mail publié sur le site : page d'accueil, puis /contact. Rien si robots.txt interdit la visite. */
async function siteEmail(website: string): Promise<string | null> {
  const start = siteUrl(website);
  if (!start) return null;
  const robots = await fetchText(new URL("/robots.txt", start));
  if (robots && /^\s*disallow:\s*\/\s*$/im.test(robots)) return null;
  for (const page of [start, new URL("/contact", start)]) {
    const html = await fetchText(page);
    if (html) {
      const [email] = extractEmails(html, start.hostname);
      if (email) return email;
    }
    await pause(1_000);
  }
  return null;
}

try {
  // 1. Recherche : un passage par métier. Le jeu de test remplace Overpass, sans réseau.
  const found: { label: string; candidate: Candidate }[] = [];
  const perQuery: string[] = [];
  const collect = (label: string, element: OsmElement) => {
    const candidate = toCandidate(element);
    if (candidate) found.push({ label, candidate });
  };
  if (source === "mock") {
    for (const { label, element } of mockElements()) collect(label, element);
    perQuery.push(`jeu de test : ${found.length} élément(s)`);
  } else {
    for (const query of PROSPECT_QUERIES) {
      const elements = await overpass(query);
      const before = found.length;
      for (const element of elements) collect(query.label, element);
      perQuery.push(`${query.label} : ${elements.length} élément(s) OSM, ${found.length - before} avec un nom`);
      await pause(1_500);
    }
  }

  // 2. Filtre de sécurité avant toute visite de site : métier reconnu, prescripteur, hors toiture.
  const screened = found.filter(({ candidate }) => screenMetier(candidate.metier) === null);
  const rejectedMetier = found.length - screened.length;

  // 3. E-mail manquant : on cherche sur le site web, dans la limite de --sites.
  let visited = 0;
  let foundOnSite = 0;
  if (source === "overpass") {
    for (const { candidate } of screened) {
      if (candidate.email || !candidate.website) continue;
      if (visited >= siteLimit) break;
      visited += 1;
      const email = await siteEmail(candidate.website);
      if (email) {
        candidate.email = email;
        foundOnSite += 1;
      }
      await pause(1_000);
    }
  }
  const withEmail = screened.filter(({ candidate }) => candidate.email);
  const withoutEmail = screened.length - withEmail.length;

  // 4. Filtre du registre : doublons, blocklist, adresse invalide, complétion des champs vides. Même règle que l'import CSV.
  const rows = withEmail.map(({ candidate }) => ({
    company: candidate.company,
    email: normalizeEmail(candidate.email ?? ""),
    phone: candidate.phone ?? "",
    city: candidate.city ?? "",
    metier: candidate.metier ?? "",
  }));
  const blocklist = new Set((await prisma.outreachBlocklist.findMany({ select: { email: true } })).map((row) => row.email));
  const emails = rows.map((row) => row.email).filter(Boolean);
  const known = emails.length
    ? await prisma.outreachProspect.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, status: true, company: true, phone: true, city: true, activity: true },
      })
    : [];
  const existing = new Map(known.map((prospect) => [prospect.email, prospect]));
  const plan: Plan = planImport(rows, HEADERS, { blocklist, existing, now: new Date(), source: SOURCE_TAG });

  // Rapport : entreprise et métier seulement, jamais l'e-mail.
  console.log(`Source : ${source === "mock" ? "jeu de test (aucune donnée réelle)" : `OpenStreetMap via Overpass, zone ${ZONE_LABEL}`}`);
  for (const line of perQuery) console.log(`  ${line}`);
  console.log(`Retenus après métier visé : ${screened.length} (hors métier visé : ${rejectedMetier})`);
  console.log(`Sites visités pour un e-mail : ${visited} ; e-mails trouvés sur les sites : ${foundOnSite}`);
  console.log(`Sans e-mail, non écrits : ${withoutEmail}`);
  console.log(`Valides, à créer en statut Nouveau : ${plan.creates.length}`);
  const byMetier = new Map<string, number>();
  for (const creation of plan.creates) byMetier.set(creation.activity, (byMetier.get(creation.activity) ?? 0) + 1);
  for (const [metier, count] of byMetier) console.log(`  ${metier} : ${count}`);
  for (const creation of plan.creates.slice(0, 10)) console.log(`  + ${creation.company}`);
  if (plan.creates.length > 10) console.log(`  … et ${plan.creates.length - 10} autre(s)`);
  console.log(`Déjà en base, champs vides à compléter : ${plan.completions.length}`);
  for (const completion of plan.completions) console.log(`  ~ ${completion.company} : ${Object.keys(completion.data).join(", ")}`);
  console.log(`Déjà en base, rien à compléter : ${plan.unchanged}`);
  console.log(`Rejetées par le registre : ${plan.rejections.length}`);
  for (const rejection of plan.rejections) console.log(`  AVERT ${rejection.label} : ${rejection.reason}`);

  if (mode === "dry-run") {
    console.log("Essai à blanc : rien n'est écrit. --apply pour écrire.");
  } else {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const created = plan.creates.length
          ? (await tx.outreachProspect.createMany({ data: plan.creates.map((creation) => creation.data), skipDuplicates: true })).count
          : 0;
        let completed = 0;
        for (const completion of plan.completions) {
          await tx.outreachProspect.update({ where: { id: completion.id }, data: completion.data });
          completed += 1;
        }
        return { created, completed };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`Écrit : ${outcome.created} créé(s), ${outcome.completed} complété(s), en une seule transaction.`);
  }
} catch (error) {
  console.error("ERREUR : rien n'est écrit :", error instanceof Error ? error.message : "erreur inconnue");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
