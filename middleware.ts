import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";

// Ouvertes sans session : la page de connexion, et la réception des leads, appelée par les
// satellites (sans cookie) et protégée par sa propre clé, HUB_SECRET_KEY.
// Les tâches planifiées (Vercel Cron) appellent les routes /api/cron/* sans session : chaque route vérifie
// CRON_SECRET. Vercel les appelle en GET.
// robots.txt et sitemap.xml se lisent sans session : les moteurs de recherche les demandent sans cookie.
// /devis : tunnel de leads public, sans menu ni données du dashboard ; sa route POST /api/leads/public
// est publique (voir PUBLIC_POSTS) et limitée en débit.
const PUBLIC_PATHS = new Set([
  "/login",
  "/devis",
  "/robots.txt",
  "/sitemap.xml",
  "/api/leads/inbound",
  "/api/cron/fleet-status",
  "/api/cron/seo-audit",
  "/api/cron/publish",
  "/api/cron/chasseur",
  "/api/cron/prospector",
  "/api/cron/auto-sender",
  // Tâches de l'Orchestrateur : lues par le dashboard (session) ou par un agent (ORCHESTRATOR_TOKEN). La route vérifie les deux.
  "/api/tasks/pending",
  // Fichier de vérification de domaine TikTok : TikTok le lit sans cookie. Seul ce chemin exact est ouvert.
  "/api/auth/tiktok/callback/tiktoktzmiw1sr4b9DeMjCYXNSxJ3JSimF90QZ.txt",
  // Vérification du préfixe d'URL TikTok (racine du domaine) : TikTok le lit sans cookie. Seul ce chemin exact est ouvert.
  "/tiktok3d0Q5otDtdPSa3HbLEKbjeUazz1AW7yr.txt",
]);
// En POST seulement : les rapports du daemon securium-fleet-watch, protégés par HUB_API_KEY, et
// l'import des prospects (scripts/migrate-outreach.mts) et le lancement de workflows (/api/agents/trigger),
// protégés par HUB_SECRET_KEY, vérifié dans la route. Le rapport quotidien du Chief Data Officer
// (/api/reports/upload), protégé par HUB_API_KEY, vérifié dans la route.
// GET /api/telemetry, lu par le HUD, reste derrière la session.
const PUBLIC_POSTS = new Set([
  "/api/telemetry",
  "/api/outreach/import",
  "/api/agents/trigger",
  "/api/reports/upload",
  "/api/leads/public",
  // Déclaration d'un acheteur depuis son lien signé : le jeton est la seule autorisation, vérifiée dans la route.
  "/api/partenaire/declare",
  // Acquisition automatique (Chasseur) : appelle sans session, authentifiée par CHASSEUR_API_KEY dans la route.
  "/api/chasseur/ingest",
  // Stripe appelle ce webhook sans session : la signature est vérifiée dans la route.
  "/api/webhooks/stripe",
  // Rapports de l'Orchestrateur (Discord) : sans session, authentifiés par ORCHESTRATOR_TOKEN dans la route.
  "/api/webhooks/orchestrator",
  // Trafic GA4 par site, envoyé par le rapport quotidien (securium-agency-v2) : authentifié par HUB_API_KEY dans la route.
  "/api/ecosystem/traffic",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Lien de déclaration d'un acheteur (/partenaire/<jeton>) : la page vérifie le jeton et n'affiche rien sans lui.
  const buyerLink = request.method === "GET" && pathname.startsWith("/partenaire/");
  if (PUBLIC_PATHS.has(pathname) || buyerLink || (request.method === "POST" && PUBLIC_POSTS.has(pathname))) {
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
  // Fichiers 3D statiques (modèles glTF/GLB) : publics, chargés par le navigateur sans session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf|bin)$).*)"],
};
