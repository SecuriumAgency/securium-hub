import { NextResponse, type NextRequest } from "next/server";
import { auditSite } from "@/lib/seo/audit";
import { initialSites } from "@/lib/sites";

// Audit SEO d'un site de la flotte. Session admin requise (middleware.ts).
// Corps attendu : { "siteId": "elite-depannage-34" }. Seuls les sites de lib/mock-data.json avec une URL sont audités.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const siteId = typeof body === "object" && body !== null && "siteId" in body && typeof body.siteId === "string" ? body.siteId : "";

  const site = initialSites.find((item) => item.id === siteId);
  if (!site) return NextResponse.json({ error: "Site inconnu." }, { status: 404 });
  if (!site.url) return NextResponse.json({ error: "Ce site n’a pas d’URL de production." }, { status: 422 });

  const audit = await auditSite({ id: site.id, name: site.name, url: site.url });
  return NextResponse.json(audit);
}
