import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { callModule, invalidInput, moduleFailure, moduleUrl, notConfigured, NO_STORE, unauthorized } from "@/lib/integrations/bridge";

// Pont vers Open-SEO : lance un audit d'une page https. C'est Open-SEO qui récupère la page, le Hub ne fait que transmettre l'URL.
export const dynamic = "force-dynamic";

// Un audit peut prendre plusieurs dizaines de secondes.
const AUDIT_TIMEOUT_MS = 60_000;

const auditBody = z.object({ url: z.url({ protocol: /^https$/ }).max(200) });

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return unauthorized();

  const url = moduleUrl("OPEN_SEO");
  if (!url) return notConfigured("Open-SEO", ["OPEN_SEO_URL"]);

  const body = auditBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidInput("URL https attendue, 200 caractères maximum.");

  const token = process.env.OPEN_SEO_API_TOKEN;
  try {
    const upstream = await callModule(
      "Open-SEO",
      `${url}/api/audit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: body.data.url }),
      },
      AUDIT_TIMEOUT_MS,
    );
    return NextResponse.json(await upstream.json(), { headers: NO_STORE });
  } catch (error) {
    return moduleFailure(error);
  }
}
