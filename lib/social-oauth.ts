import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, exchangeCode, type OAuthApp } from "@/lib/agents/iafluencer";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { disconnectSocialAccount, exchangeLongLivedMeta, fetchProfile, refreshTokens } from "@/lib/api/social";
import { readSocialTokens, saveSocialAccount, updateSocialTokens } from "@/lib/social-accounts";

// Flux OAuth2 Instagram (Meta) et TikTok (PKCE). Serveur uniquement : les secrets ne sortent jamais d'ici.
// Les routes /api/auth/* restent derrière la session admin (middleware.ts).

// Valeur de remplacement livrée dans .env.example : elle signifie « non configuré ».
const PLACEHOLDER = "a_remplir";
const COOKIE_MAX_AGE_S = 600;

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

/** Noms des variables absentes ou sur « a_remplir » pour une plateforme. Vide = application configurée. */
export function missingVariables(platform: SocialPlatform): string[] {
  const names = VARIABLES[platform];
  return [names.id, names.secret, names.redirect].filter((name) => readVariable(name) === null);
}

/** Vrai si l'application OAuth de la plateforme est renseignée (aucun appel réseau). */
export function isPlatformConfigured(platform: SocialPlatform): boolean {
  return oauthAppFor(platform) !== null;
}

const stateCookie = (platform: SocialPlatform) => `iafluencer_oauth_${platform}`;
const verifierCookie = (platform: SocialPlatform) => `iafluencer_pkce_${platform}`;

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
// 303 : une soumission de formulaire (déconnexion, rafraîchissement) doit être suivie en GET.
function dashboardRedirect(request: NextRequest, platform: SocialPlatform, status: string): NextResponse {
  const url = new URL("/admin/iafluencer", request.url);
  url.searchParams.set("oauth", status);
  url.searchParams.set("platform", platform);
  return NextResponse.redirect(url, 303);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Initialise le flux : état anti-CSRF, et pour TikTok un vérifieur PKCE, tous deux en cookies httpOnly. */
export function beginOAuth(request: NextRequest, platform: SocialPlatform): NextResponse {
  const app = oauthAppFor(platform);
  if (!app) return dashboardRedirect(request, platform, "non_configuree");

  const state = randomBytes(24).toString("base64url");
  // PKCE S256 : seule l'empreinte du vérifieur part vers TikTok, le vérifieur reste dans le cookie.
  const verifier = platform === "tiktok" ? randomBytes(48).toString("base64url") : null;
  const challenge = verifier ? createHash("sha256").update(verifier).digest("base64url") : null;

  const response = NextResponse.redirect(buildAuthorizeUrl(platform, app, state, challenge));
  response.cookies.set(stateCookie(platform), state, cookieOptions(COOKIE_MAX_AGE_S));
  if (verifier) response.cookies.set(verifierCookie(platform), verifier, cookieOptions(COOKIE_MAX_AGE_S));
  return response;
}

/** Retour du fournisseur : vérifie l'état, échange le code, passe Meta en longue durée, enregistre le profil et les jetons chiffrés. */
export async function completeOAuth(request: NextRequest, platform: SocialPlatform): Promise<NextResponse> {
  const clear = (response: NextResponse) => {
    response.cookies.set(stateCookie(platform), "", cookieOptions(0));
    response.cookies.set(verifierCookie(platform), "", cookieOptions(0));
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return clear(dashboardRedirect(request, platform, "refuse"));

  const expected = request.cookies.get(stateCookie(platform))?.value;
  const received = params.get("state");
  if (!expected || !received || !safeEqual(expected, received)) {
    return clear(dashboardRedirect(request, platform, "etat_invalide"));
  }

  const app = oauthAppFor(platform);
  if (!app) return clear(dashboardRedirect(request, platform, "non_configuree"));

  const code = params.get("code");
  if (!code) return clear(dashboardRedirect(request, platform, "code_absent"));

  const verifier = platform === "tiktok" ? request.cookies.get(verifierCookie(platform))?.value ?? null : null;
  if (platform === "tiktok" && !verifier) return clear(dashboardRedirect(request, platform, "etat_invalide"));

  try {
    let tokens = await exchangeCode(platform, app, code, verifier);
    // Meta : le jeton court (environ une heure) devient un jeton longue durée (environ soixante jours).
    if (platform === "instagram") tokens = await exchangeLongLivedMeta(app, tokens.accessToken);
    const profile = await fetchProfile(platform, tokens.accessToken);
    await saveSocialAccount(platform, tokens, profile);
    return clear(dashboardRedirect(request, platform, "ok"));
  } catch (error) {
    // Seul le message d'erreur sort dans les journaux : ni jeton, ni secret, ni corps de réponse.
    console.error(`[oauth:${platform}] échec :`, error instanceof Error ? error.message : "erreur inconnue");
    return clear(dashboardRedirect(request, platform, "echec"));
  }
}

/** Rafraîchit le jeton d'un compte relié. Les jetons restent chiffrés et ne quittent pas le serveur. */
export async function refreshOAuth(request: NextRequest, platform: SocialPlatform): Promise<NextResponse> {
  const app = oauthAppFor(platform);
  if (!app) return dashboardRedirect(request, platform, "non_configuree");
  try {
    const current = await readSocialTokens(platform);
    if (!current) return dashboardRedirect(request, platform, "non_connecte");
    const next = await refreshTokens(platform, app, current);
    await updateSocialTokens(platform, next);
    return dashboardRedirect(request, platform, "rafraichi");
  } catch (error) {
    console.error(`[oauth:${platform}] rafraîchissement impossible :`, error instanceof Error ? error.message : "erreur inconnue");
    return dashboardRedirect(request, platform, "echec_rafraichissement");
  }
}

/** Déconnexion : supprime le compte et son jeton en base, puis révoque l'accès chez le fournisseur. */
export async function disconnectOAuth(request: NextRequest, platform: SocialPlatform): Promise<NextResponse> {
  try {
    await disconnectSocialAccount(platform, oauthAppFor(platform));
    return dashboardRedirect(request, platform, "deconnecte");
  } catch (error) {
    console.error(`[oauth:${platform}] déconnexion impossible :`, error instanceof Error ? error.message : "erreur inconnue");
    return dashboardRedirect(request, platform, "echec");
  }
}
