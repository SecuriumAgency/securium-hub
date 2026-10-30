import { auditPage, summarize, type PageFacts, type SeoAudit } from "./checks";

// Délais et tailles bornés : un site lent ou lourd ne bloque pas la page d'administration.
const TIMEOUT_MS = 10_000;
const MAX_CHARS = 2 * 1024 * 1024;
const USER_AGENT = "SecuriumHubAudit/1.0";

export type FleetSite = { id: string; name: string; url: string };

type Fetched = { status: number | null; text: string; headers: Headers | null; url: string };

async function fetchText(url: string): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = (await response.text()).slice(0, MAX_CHARS);
    return { status: response.status, text, headers: response.headers, url: response.url };
  } catch {
    return { status: null, text: "", headers: null, url: "" };
  }
}

// Audit d'un site de la flotte. L'URL vient de lib/mock-data.json et jamais d'une saisie : le module ne
// peut pas servir de relais vers une adresse choisie par la requête.
export async function auditSite(site: FleetSite): Promise<SeoAudit> {
  const page = new URL(site.url);
  const [html, robots, sitemap] = await Promise.all([
    fetchText(page.href),
    fetchText(new URL("/robots.txt", page).href),
    fetchText(new URL("/sitemap.xml", page).href),
  ]);
  const facts: PageFacts = {
    url: page.href,
    finalUrl: html.url || page.href,
    pageStatus: html.status,
    html: html.text,
    noindexHeader: /noindex/i.test(html.headers?.get("x-robots-tag") ?? ""),
    robotsStatus: robots.status,
    robotsText: robots.text,
    sitemapStatus: sitemap.status,
  };
  return summarize(site, auditPage(facts), new Date());
}
