import { NextResponse } from "next/server";
import { NO_STORE } from "@/lib/integrations/bridge";
import { INTEGRATION_MODULES } from "@/lib/integrations/modules";

// Supervision du Hub : indique si les variables critiques sont renseignées. Aucune valeur n'est renvoyée.
// Le middleware garde toutes les routes /api/* derrière la session admin : une sonde externe reçoit un 401.
export const dynamic = "force-dynamic";

const isSet = (name: string) => Boolean(process.env[name]?.trim());

export async function GET() {
  const critical = {
    database: isSet("DATABASE_URL") || isSet("POSTGRES_PRISMA_URL"),
    sessionSecret: isSet("SESSION_SECRET"),
    hubSecretKey: isSet("HUB_SECRET_KEY"),
    cloudflareAccess: isSet("CF_ACCESS_CLIENT_ID") && isSet("CF_ACCESS_CLIENT_SECRET"),
  };
  const modules = Object.fromEntries(
    INTEGRATION_MODULES.map((module) => [module.id, { urlConfigured: isSet(`${module.prefix}_URL`) }]),
  );
  const healthy = Object.values(critical).every(Boolean);

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checkedAt: new Date().toISOString(), critical, modules },
    { headers: NO_STORE },
  );
}
