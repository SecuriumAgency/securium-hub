// Publication sur Instagram (API Graph, conteneur média puis publication) et TikTok (Content Posting API).
// Serveur uniquement. Les messages d'erreur ne contiennent jamais de jeton.

export type PublishFormat = "FEED" | "REELS" | "STORIES";

export type PublishErrorKind = "rate_limit" | "token_expired" | "processing" | "rejected" | "unknown";

/** Erreur de publication. `retryable` : une nouvelle tentative plus tard peut réussir. */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly kind: PublishErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";
const TIKTOK_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_ATTEMPTS = 10;

// Codes Graph : 190 = jeton expiré ou révoqué ; 4, 17, 32, 613 = quotas d'appels.
const GRAPH_TOKEN_CODES = new Set([190]);
const GRAPH_RATE_CODES = new Set([4, 17, 32, 613]);

function graphError(status: number, body: unknown): PublishError {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof error?.code === "number" ? error.code : null;
  const detail = typeof error?.message === "string" ? error.message.slice(0, 200) : `HTTP ${status}`;
  if (code !== null && GRAPH_TOKEN_CODES.has(code)) return new PublishError(`Jeton Instagram expiré : reconnectez le compte (${detail}).`, "token_expired", false);
  if ((code !== null && GRAPH_RATE_CODES.has(code)) || status === 429) {
    return new PublishError(`Limite d'appels Instagram atteinte, nouvelle tentative plus tard (${detail}).`, "rate_limit", true);
  }
  return new PublishError(`Instagram a refusé la publication (${detail}).`, "rejected", false);
}

async function graphCall(path: string, accessToken: string, method: "GET" | "POST", params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GRAPH}/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (method === "POST" && params) init.body = new URLSearchParams(params);
  if (method === "GET" && params) for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw graphError(response.status, body);
  return body;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Instagram : crée le conteneur vidéo (asynchrone), attend son traitement, puis le publie.
 * Les Stories n'acceptent pas de légende par l'API : elle est omise dans ce cas.
 */
export async function publishToInstagram(input: {
  igUserId: string;
  mediaUrl: string;
  caption: string;
  format: PublishFormat;
  accessToken: string;
}): Promise<string> {
  const params: Record<string, string> = { video_url: input.mediaUrl };
  if (input.format === "STORIES") params.media_type = "STORIES";
  else if (input.format === "REELS") params.media_type = "REELS";
  else params.media_type = "VIDEO";
  if (input.format !== "STORIES") params.caption = input.caption;

  const container = (await graphCall(`${input.igUserId}/media`, input.accessToken, "POST", params)) as { id?: unknown };
  if (typeof container.id !== "string") throw new PublishError("Instagram n'a pas renvoyé de conteneur média.", "rejected", false);

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const status = (await graphCall(container.id, input.accessToken, "GET", { fields: "status_code" })) as { status_code?: unknown };
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new PublishError(`Traitement Instagram en échec (${String(status.status_code)}).`, "rejected", false);
    }
    if (attempt === POLL_ATTEMPTS - 1) throw new PublishError("Vidéo encore en traitement chez Instagram.", "processing", true);
    await sleep(POLL_INTERVAL_MS);
  }

  const published = (await graphCall(`${input.igUserId}/media_publish`, input.accessToken, "POST", { creation_id: container.id })) as { id?: unknown };
  if (typeof published.id !== "string") throw new PublishError("Instagram n'a pas confirmé la publication.", "rejected", false);
  return published.id;
}

/**
 * TikTok : initialise la publication depuis l'URL du fichier vertical (9:16).
 * Tant que l'application n'a pas été validée par TikTok, seule la visibilité « moi uniquement » est acceptée.
 */
export async function publishToTikTok(input: { mediaUrl: string; caption: string; accessToken: string }): Promise<string> {
  const response = await fetch(TIKTOK_INIT, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: input.caption.slice(0, 2200), privacy_level: "SELF_ONLY", disable_comment: false },
      source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrl },
    }),
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { data?: { publish_id?: unknown }; error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code : null;
  if (!response.ok || (code !== null && code !== "ok")) {
    const detail = typeof body?.error?.message === "string" ? body.error.message.slice(0, 200) : `HTTP ${response.status}`;
    if (code === "access_token_invalid") throw new PublishError(`Jeton TikTok expiré : reconnectez le compte (${detail}).`, "token_expired", false);
    if (code === "rate_limit_exceeded" || response.status === 429) throw new PublishError(`Limite d'appels TikTok atteinte (${detail}).`, "rate_limit", true);
    throw new PublishError(`TikTok a refusé la publication (${detail}).`, "rejected", false);
  }
  if (typeof body?.data?.publish_id !== "string") throw new PublishError("TikTok n'a pas renvoyé d'identifiant de publication.", "rejected", false);
  return body.data.publish_id;
}
