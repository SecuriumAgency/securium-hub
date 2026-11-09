import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { prisma } from "@/lib/prisma";
import { initialSites } from "@/lib/sites";

// Trafic GA4 par site, envoyé chaque jour par le rapport quotidien (securium-agency-v2). Appelée sans session :
// HUB_API_KEY la protège, comme /api/reports/upload. Un envoi du même jour remplace le précédent par site.
// Corps attendu : { "date": "AAAA-MM-JJ", "sites": [{ "siteId", "sessions", "users", "pageviews" }] }.
export const dynamic = "force-dynamic";

// Une clé courte se devinerait : en dessous, la réception reste fermée (même règle que /api/reports/upload).
const MIN_KEY_LENGTH = 32;
const MAX_SITES = 20;
const MAX_COUNT = 100_000_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SITE_IDS = new Set(initialSites.map((site) => site.id));

type SiteTraffic = { siteId: string; sessions: number; users: number; pageviews: number };

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
}

// Valide chaque entrée. Renvoie la liste nettoyée, ou le motif du premier rejet.
function parseSites(value: unknown): { ok: true; sites: SiteTraffic[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SITES) {
    return { ok: false, error: `sites doit être un tableau de 1 à ${MAX_SITES} entrées.` };
  }
  const sites: SiteTraffic[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null) return { ok: false, error: `sites[${index}] doit être un objet.` };
    const row = item as Record<string, unknown>;
    if (typeof row.siteId !== "string" || !SITE_IDS.has(row.siteId)) {
      return { ok: false, error: `sites[${index}].siteId est inconnu.` };
    }
    if (!isCount(row.sessions) || !isCount(row.users) || !isCount(row.pageviews)) {
      return { ok: false, error: `sites[${index}] : sessions, users et pageviews doivent être des entiers positifs.` };
    }
    sites.push({ siteId: row.siteId, sessions: row.sessions, users: row.users, pageviews: row.pageviews });
  }
  return { ok: true, sites };
}

export async function POST(request: NextRequest) {
  const secret = process.env.HUB_API_KEY;
  if (!secret || secret.length < MIN_KEY_LENGTH) {
    console.error(`[traffic] HUB_API_KEY absent ou de moins de ${MIN_KEY_LENGTH} caractères : réception refusée.`);
    return NextResponse.json({ error: "Réception du trafic non configurée." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof input.date !== "string" || !DATE_PATTERN.test(input.date)) {
    return NextResponse.json({ error: "date (AAAA-MM-JJ) requis." }, { status: 422 });
  }
  const date = input.date;
  const parsed = parseSites(input.sites);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  try {
    await prisma.$transaction(
      parsed.sites.map((row) =>
        prisma.siteTrafficDaily.upsert({
          where: { date_siteId: { date, siteId: row.siteId } },
          create: { date, ...row },
          update: { sessions: row.sessions, users: row.users, pageviews: row.pageviews, receivedAt: new Date() },
        }),
      ),
    );
    return NextResponse.json({ date, saved: parsed.sites.length });
  } catch (error) {
    console.error("[traffic] enregistrement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement du trafic impossible." }, { status: 500 });
  }
}
