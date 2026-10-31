import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { runSecurityScan } from "@/lib/security/internal-scanner";
import { initialSites } from "@/lib/sites";

// Scan d'un site de la flotte, réservé à l'admin. Le scanner sonde des chemins sensibles (/.env, /.git/config) :
// il ne se lance que sur les hôtes de la flotte, en https, sans port particulier.
export const dynamic = "force-dynamic";

const FLEET_HOSTS = new Set(initialSites.flatMap((site) => (site.url ? [new URL(site.url).hostname] : [])));

const scanBody = z.object({ url: z.string().min(1).max(200) });

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const body = scanBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Champ url attendu." }, { status: 422 });

  let target: URL;
  try {
    target = new URL(body.data.url);
  } catch {
    return NextResponse.json({ error: "URL invalide." }, { status: 422 });
  }

  if (target.protocol !== "https:" || target.port !== "" || !FLEET_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Cible hors de la flotte : seuls les sites https de la flotte sont scannés." }, { status: 403 });
  }

  try {
    const report = await runSecurityScan(target.origin);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Le scan a échoué." }, { status: 502 });
  }
}
