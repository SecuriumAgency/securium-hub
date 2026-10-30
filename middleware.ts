import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";

// Ouvertes sans session : la page de connexion, et la réception des leads, appelée par les
// satellites (sans cookie) et protégée par sa propre clé, HUB_SECRET_KEY.
const PUBLIC_PATHS = new Set(["/login", "/api/leads/inbound"]);
// En POST seulement : les rapports du daemon securium-fleet-watch, protégés par HUB_API_KEY, et
// l'import des prospects (scripts/migrate-outreach.mts) et le lancement de workflows (/api/agents/trigger),
// protégés par HUB_SECRET_KEY, vérifié dans la route.
// GET /api/telemetry, lu par le HUD, reste derrière la session.
const PUBLIC_POSTS = new Set(["/api/telemetry", "/api/outreach/import", "/api/agents/trigger"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || (request.method === "POST" && PUBLIC_POSTS.has(pathname))) {
    return NextResponse.next();
  }

  const secret = sessionSecret();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (secret && (await verifySessionToken(token, secret))) return NextResponse.next();

  // Le polling du HUD reçoit un 401 : une redirection lui renverrait le HTML de /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  runtime: "nodejs",
  // Toutes les routes, sauf les fichiers statiques de Next et de public/.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
