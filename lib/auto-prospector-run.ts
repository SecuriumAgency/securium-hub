import { normalizeEmail } from "./outreach";
import { planImport, type Plan } from "./prescribers-import";
import { prisma } from "./prisma";
import { PROSPECT_QUERIES, extractEmails, mockElements, overpassQuery, screenMetier, toCandidate, type Candidate, type OsmElement, type ProspectQuery } from "./auto-prospector";

// Passage du Lead Prospector : OpenStreetMap (Overpass) → filtre de sécurité → e-mail sur le site si besoin →
// registre. Lancé par Vercel Cron (app/api/cron/prospector) ou à la main (scripts/auto-prospector.mts).
// Rien n'est envoyé ici : les prospects entrent au statut Nouveau, et le Chasseur leur rédige un brouillon.

export const SOURCE_TAG = "auto-prospector-osm";
const USER_AGENT = "SecuriumHubProspector/1.0";
const HEADERS = ["company", "email", "phone", "city", "metier"];

export type ProspectorSource = "overpass" | "mock";

export type ProspectorRun = {
  source: ProspectorSource;
  perQuery: string[];
  found: number;
  screened: number;
  rejectedMetier: number;
  visited: number;
  foundOnSite: number;
  withoutEmail: number;
  // Contient les e-mails : ne pas le renvoyer tel quel hors de la console.
  plan: Plan;
  written: { created: number; completed: number } | null;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Éléments OpenStreetMap d'un métier, dans la zone. */
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

/**
 * Un passage complet. `apply` écrit en base (création et complétion, une seule transaction). Le jeu de test ne
 * s'écrit jamais : refusé ici, pas seulement dans le script.
 */
export async function runProspector({
  source,
  siteLimit,
  apply,
  now = new Date(),
}: {
  source: ProspectorSource;
  siteLimit: number;
  apply: boolean;
  now?: Date;
}): Promise<ProspectorRun> {
  if (apply && source === "mock") throw new Error("le jeu de test ne s'écrit jamais en base.");

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

  // 3. E-mail manquant : on cherche sur le site web, dans la limite de siteLimit.
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

  // 4. Registre : doublons, blocklist, adresse invalide, complétion des champs vides. Même règle que l'import CSV.
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
  const plan = planImport(rows, HEADERS, { blocklist, existing, now, source: SOURCE_TAG });

  let written: ProspectorRun["written"] = null;
  if (apply) {
    written = await prisma.$transaction(
      async (tx) => {
        const created = plan.creates.length
          ? (await tx.outreachProspect.createMany({ data: plan.creates.map((creation) => creation.data), skipDuplicates: true })).count
          : 0;
        for (const completion of plan.completions) {
          await tx.outreachProspect.update({ where: { id: completion.id }, data: completion.data });
        }
        return { created, completed: plan.completions.length };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  return {
    source,
    perQuery,
    found: found.length,
    screened: screened.length,
    rejectedMetier: found.length - screened.length,
    visited,
    foundOnSite,
    withoutEmail: screened.length - withEmail.length,
    plan,
    written,
  };
}
