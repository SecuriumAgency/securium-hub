import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, exchangeCode, type OAuthApp } from "@/lib/agents/iafluencer";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { saveSocialAccount } from "@/lib/social-accounts";

// Flux OAuth2 Instagram (Meta) et TikTok. Serveur uniquement : les secrets ne sortent jamais d'ici.
// Les routes /api/auth/* restent derrière la session admin (middleware.ts).

// Valeur de remplacement livrée dans .env.example : elle signifie « non configuré ».
const PLACEHOLDER = "a_remplir";
const STATE_MAX_AGE_S = 600;

const VARIABLES: Record<SocialPlatform, { id: string; secret: string; redirect: string }> = {
  instagram: { id: "META_CLIENT_ID", secret: "META_CLIENT_SECRET", redirect: "META_REDIRECT_URI" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET", redirect: "TIKTOK_REDIRECT_URI" },
};

function readVariable(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value !== PLACEHOLDER ? value : null;
}

/** Application OAuth de la plateforme, ou null si une variable manque ou reste sur « a_remplir ». */
export function oauthAppFor(platform: SocialPlatform): OAuthApp | null {
  const names = VARIABLES[platform];
  const clientId = readVariable(names.id);
  const clientSecret = readVariable(names.secret);
  const redirectUri = readVariable(names.redirect);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Vrai si l'application OAuth de la plateforme est renseignée (aucun appel réseau). */
export function isPlatformConfigured(platform: SocialPlatform): boolean {
  return oauthAppFor(platform) !== null;
}

function stateCookieName(platform: SocialPlatform) {
  return `iafluencer_oauth_${platform}`;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge,
  };
}

// Retour vers le tableau de bord, avec un statut lisible (jamais de jeton ni de secret dans l'URL).
function dashboardRedirect(request: NextRequest, platform: SocialPlatform, status: string): NextResponse {
  const url = new URL("/admin/iafluencer", request.url);
  url.searchParams.set("oauth", status);
  url.searchParams.set("platform", platform);
  return NextResponse.redirect(url);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Initialise le flux : état aléatoire en cookie httpOnly, puis redirection vers l'écran de consentement. */
export function beginOAuth(request: NextRequest, platform: SocialPlatform): NextResponse {
  const app = oauthAppFor(platform);
  if (!app) return dashboardRedirect(request, platform, "non_configuree");

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(platform, app, state));
  response.cookies.set(stateCookieName(platform), state, cookieOptions(STATE_MAX_AGE_S));
  return response;
}

/** Reçoit le retour de la plateforme : vérifie l'état, échange le code, chiffre et enregistre le jeton. */
export async function completeOAuth(request: NextRequest, platform: SocialPlatform): Promise<NextResponse> {
  const cookieName = stateCookieName(platform);
  const clear = (response: NextResponse) => {
    response.cookies.set(cookieName, "", cookieOptions(0));
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return clear(dashboardRedirect(request, platform, "refuse"));

  const expected = request.cookies.get(cookieName)?.value;
  const received = params.get("state");
  if (!expected || !received || !safeEqual(expected, received)) {
    return clear(dashboardRedirect(request, platform, "etat_invalide"));
  }

  const app = oauthAppFor(platform);
  if (!app) return clear(dashboardRedirect(request, platform, "non_configuree"));

  const code = params.get("code");
  if (!code) return clear(dashboardRedirect(request, platform, "code_absent"));

  try {
    const tokens = await exchangeCode(platform, app, code);
    await saveSocialAccount(platform, tokens);
    return clear(dashboardRedirect(request, platform, "ok"));
  } catch (error) {
    // Seul le message d'erreur sort dans les journaux : ni jeton, ni secret, ni corps de réponse.
    console.error(`[oauth:${platform}] échec :`, error instanceof Error ? error.message : "erreur inconnue");
    return clear(dashboardRedirect(request, platform, "echec"));
  }
}
