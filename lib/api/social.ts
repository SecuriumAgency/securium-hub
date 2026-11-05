import type { OAuthApp, TokenSet } from "@/lib/agents/iafluencer";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { connectedAccounts, removeSocialAccount, type SocialProfile } from "@/lib/social-accounts";

// Services sociaux : état des connexions, profils publics, rafraîchissement et déconnexion des jetons.
// Serveur uniquement. Les appels sortants ont un délai maximal et ne renvoient jamais de jeton dans
// les messages d'erreur.

const META_GRAPH = "https://graph.facebook.com/v21.0";
const TIKTOK_USER_INFO = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_REVOKE = "https://open.tiktokapis.com/v2/oauth/revoke/";
const DELAI_RESEAU_MS = 8000;

export type SocialAccountStatus =
  | { connected: false }
  | { connected: true; accountName: string | null; avatarUrl: string | null; externalId: string | null };

/** État de chaque plateforme, lu en base. Ne renvoie jamais de jeton. */
export async function getSocialAccountsStatus(): Promise<Record<SocialPlatform, SocialAccountStatus>> {
  const accounts = await connectedAccounts();
  const status = (platform: SocialPlatform): SocialAccountStatus => {
    const profile: SocialProfile | undefined = accounts.get(platform);
    if (!profile) return { connected: false };
    return { connected: true, accountName: profile.accountName, avatarUrl: profile.avatarUrl, externalId: profile.externalId };
  };
  return { instagram: status("instagram"), tiktok: status("tiktok") };
}

/** Profil public du compte : identifiant, nom affiché et photo. Best-effort : null si la lecture échoue. */
export async function fetchProfile(platform: SocialPlatform, accessToken: string): Promise<SocialProfile> {
  const empty: SocialProfile = { externalId: null, accountName: null, avatarUrl: null };
  try {
    const signal = AbortSignal.timeout(DELAI_RESEAU_MS);
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (platform === "instagram") {
      // Compte Instagram professionnel rattaché à une page Facebook.
      const response = await fetch(`${META_GRAPH}/me/accounts?fields=instagram_business_account{id,username,profile_picture_url}`, {
        headers,
        redirect: "error",
        signal,
      });
      if (!response.ok) return empty;
      const body = (await response.json()) as {
        data?: { instagram_business_account?: { id?: unknown; username?: unknown; profile_picture_url?: unknown } }[];
      };
      const account = body.data?.map((page) => page.instagram_business_account).find((item) => item && typeof item.username === "string");
      if (!account) return empty;
      return {
        externalId: typeof account.id === "string" ? account.id : null,
        accountName: typeof account.username === "string" ? account.username : null,
        avatarUrl: typeof account.profile_picture_url === "string" ? account.profile_picture_url : null,
      };
    }
    const response = await fetch(TIKTOK_USER_INFO, { headers, redirect: "error", signal });
    if (!response.ok) return empty;
    const body = (await response.json()) as { data?: { user?: { open_id?: unknown; display_name?: unknown; avatar_url?: unknown } } };
    const user = body.data?.user;
    return {
      externalId: typeof user?.open_id === "string" ? user.open_id : null,
      accountName: typeof user?.display_name === "string" ? user.display_name : null,
      avatarUrl: typeof user?.avatar_url === "string" ? user.avatar_url : null,
    };
  } catch {
    return empty;
  }
}

/** Meta : échange un jeton courte durée (ou longue durée encore valide) contre un jeton longue durée. */
export async function exchangeLongLivedMeta(app: OAuthApp, token: string): Promise<TokenSet> {
  const url = new URL(`${META_GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("client_secret", app.clientSecret);
  url.searchParams.set("fb_exchange_token", token);
  const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(DELAI_RESEAU_MS) });
  if (!response.ok) throw new Error(`Échange longue durée refusé par Meta (HTTP ${response.status}).`);
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new Error("Réponse Meta sans jeton longue durée.");
  return {
    accessToken: body.access_token,
    expiresInSec: typeof body.expires_in === "number" ? body.expires_in : null,
    refreshToken: null,
  };
}

/** Rafraîchit le jeton : Meta par échange longue durée, TikTok par refresh_token. */
export async function refreshTokens(platform: SocialPlatform, app: OAuthApp, current: { accessToken: string; refreshToken: string | null }): Promise<TokenSet> {
  if (platform === "instagram") return exchangeLongLivedMeta(app, current.accessToken);
  if (!current.refreshToken) throw new Error("Aucun refresh token TikTok enregistré : reconnectez le compte.");
  const response = await fetch(TIKTOK_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(DELAI_RESEAU_MS),
  });
  if (!response.ok) throw new Error(`Rafraîchissement refusé par TikTok (HTTP ${response.status}).`);
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("Réponse TikTok sans jeton.");
  return {
    accessToken: body.access_token,
    expiresInSec: typeof body.expires_in === "number" ? body.expires_in : null,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
  };
}

/** Révoque l'accès chez le fournisseur. Best-effort : la suppression en base a déjà eu lieu. */
export async function revokeAtProvider(platform: SocialPlatform, accessToken: string, app: OAuthApp | null): Promise<void> {
  try {
    const signal = AbortSignal.timeout(DELAI_RESEAU_MS);
    const response =
      platform === "instagram"
        ? await fetch(`${META_GRAPH}/me/permissions`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error", signal })
        : app
          ? await fetch(TIKTOK_REVOKE, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ client_key: app.clientId, client_secret: app.clientSecret, token: accessToken }),
              redirect: "error",
              signal,
            })
          : null;
    if (response && !response.ok) console.error(`[social:${platform}] révocation refusée (HTTP ${response.status}).`);
  } catch (error) {
    console.error(`[social:${platform}] révocation non confirmée :`, error instanceof Error ? error.message : "erreur inconnue");
  }
}

/** Déconnexion : supprime le compte et son jeton en base, puis révoque l'accès chez le fournisseur. */
export async function disconnectSocialAccount(platform: SocialPlatform, app: OAuthApp | null): Promise<void> {
  const accessToken = await removeSocialAccount(platform);
  if (accessToken) await revokeAtProvider(platform, accessToken, app);
}
