import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { SEO_KEY, SEO_TTL_S, writeSnapshot, type SeoSnapshot } from "@/lib/cron-store";
import { auditSite } from "@/lib/seo/audit";
import { initialSites } from "@/lib/sites";

// Audit SEO hebdomadaire de la flotte (vercel.json). Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`.
// Trois requêtes par site, sans IA : le relevé est gardé pour être affiché sur /admin/seo.
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Tâche planifiée non configurée." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  const sites = initialSites.flatMap((site) => (site.url ? [{ id: site.id, name: site.name, url: site.url }] : []));
  const audits = await Promise.all(sites.map((site) => auditSite(site)));

  const snapshot: SeoSnapshot = {
    measuredAt: new Date().toISOString(),
    sites: audits.map((audit) => ({
      id: audit.siteId,
      name: audit.siteName,
      score: audit.score,
      measured: audit.coverage.measured,
      total: audit.coverage.total,
      recommendations: audit.recommendations.length,
    })),
  };
  await writeSnapshot(SEO_KEY, snapshot, SEO_TTL_S);

  return NextResponse.json(snapshot);
}
