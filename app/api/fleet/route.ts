import { NextResponse } from "next/server";
import { initialSites, type Site } from "@/lib/sites";
import { fetchDeploymentStatus } from "@/lib/vercel";

export async function GET() {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "VERCEL_API_TOKEN n'est pas défini." }, { status: 503 });
  }

  const sites: Site[] = await Promise.all(
    initialSites.map(async (site) =>
      site.vercelProject ? { ...site, status: await fetchDeploymentStatus(site.vercelProject, token) } : site,
    ),
  );

  return NextResponse.json({ sites, updatedAt: new Date().toISOString() });
}
