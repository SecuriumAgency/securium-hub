// Moteur de l'IAfluencer : connexion OAuth2 (Meta Graph pour Instagram, TikTok), planification avec gigue,
// et génération de textes par l'API Anthropic. Côté serveur uniquement : le SDK et les secrets n'y sortent jamais.
//
// Rien n'est publié sans validation humaine : `publish` exige un `approvedBy`, et le publieur de la plateforme
// doit être branché par l'appelant. Les délais aléatoires servent à garder un rythme régulier sous les bornes
// de DEFAULT_POLICIES. Ils ne cherchent pas à échapper à une détection.
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import {
  CAPTION_MAX,
  CommentReplySchema,
  DEFAULT_POLICIES,
  nextSlot,
  SOCIAL_PLATFORMS,
  StrategySchema,
  type CommentReply,
  type PublishPolicy,
  type ScheduledPost,
  type SocialPlatform,
  type Strategy,
} from "./iafluencer-rules";

// Modèle économique par défaut : la tâche est courte et le budget de tokens est limité.
export const DEFAULT_MODEL = "claude-haiku-5-5";
// Version de l'API Graph utilisée pour l'OAuth : à vérifier avant mise en production.
const META_GRAPH = "https://graph.facebook.com/v21.0";
const META_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
const TIKTOK_AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

export class IAfluencerError extends Error {
  constructor(
    message: string,
    /** 400 : requête invalide ou précondition absente. 500 : erreur côté serveur ou fournisseur. */
    readonly status: 400 | 500,
  ) {
    super(message);
    this.name = "IAfluencerError";
  }
}

export const SYSTEM_PROMPT = `Tu es un Social Media Manager Senior, spécialiste d'Instagram et de TikTok pour des artisans et de petites entreprises françaises. Tu produis des stratégies précises : hashtags pertinents et non génériques, description optimisée pour la recherche (SEO), accroche courte. Ton naturel et chaleureux, jamais racoleur, sans promesse chiffrée qui ne t'a pas été fournie.
Réponds uniquement par un objet JSON valide, sans texte autour : { "hashtags": [...], "seoDescription": "...", "captionHook": "..." }. Pas de lien, pas de compte cité qui ne figure pas dans la demande, aucune information inventée.`;

export const REPLY_PROMPT = `Tu réponds, au nom de la marque, à un commentaire public sous une publication. Ton engageant et naturel, bref, sans lien, sans promesse et sans donnée inventée. Réponds uniquement par un objet JSON valide : { "reply": "..." }.`;

// ---------- OAuth2 ----------

export type OAuthApp = { clientId: string; clientSecret: string; redirectUri: string };

/** Adresse d'autorisation à ouvrir dans le navigateur de l'utilisateur. `state` protège contre le détournement. */
export function buildAuthorizeUrl(
  platform: SocialPlatform,
  app: Pick<OAuthApp, "clientId" | "redirectUri">,
  state: string,
  codeChallenge: string | null = null,
): string {
  if (platform === "instagram") {
    const url = new URL(META_DIALOG);
    url.searchParams.set("client_id", app.clientId);
    url.searchParams.set("redirect_uri", app.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    // instagram_manage_comments est retiré : Meta refuse ce scope tant que l'application n'a pas l'accès
    // (revue d'application). Le réajouter ici une fois l'accès accordé, pour la gestion des commentaires.
    url.searchParams.set(
      "scope",
      "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
    );
    return url.toString();
  }
  const url = new URL(TIKTOK_AUTHORIZE);
  url.searchParams.set("client_key", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
  // PKCE (S256) : le vérifieur reste côté serveur, seul son empreinte part vers TikTok.
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type TokenSet = { accessToken: string; expiresInSec: number | null; refreshToken: string | null };

/** Échange le code d'autorisation contre un jeton. Le secret ne quitte que ce serveur. */
export async function exchangeCode(
  platform: SocialPlatform,
  app: OAuthApp,
  code: string,
  codeVerifier: string | null = null,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  let response: Response;
  if (platform === "instagram") {
    const url = new URL(`${META_GRAPH}/oauth/access_token`);
    url.searchParams.set("client_id", app.clientId);
    url.searchParams.set("client_secret", app.clientSecret);
    url.searchParams.set("redirect_uri", app.redirectUri);
    url.searchParams.set("code", code);
    response = await fetchImpl(url, { method: "GET", redirect: "error" });
  } else {
    response = await fetchImpl(TIKTOK_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: app.clientId,
        client_secret: app.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: app.redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
      redirect: "error",
    });
  }

  if (!response.ok) {
    // On ne renvoie ni le corps ni le secret : seul le statut sort du serveur.
    throw new IAfluencerError(`Échange OAuth refusé par ${platform} (HTTP ${response.status}).`, response.status >= 500 ? 500 : 400);
  }
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
  if (typeof body.access_token !== "string") throw new IAfluencerError(`Réponse ${platform} sans jeton.`, 500);
  return {
    accessToken: body.access_token,
    expiresInSec: typeof body.expires_in === "number" ? body.expires_in : null,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
  };
}

// ---------- Moteur ----------

export type PostDraft = { platform: SocialPlatform; caption: string; mediaName: string };

export type IAfluencerDeps = {
  anthropic?: Anthropic;
  model?: string;
  now?: () => Date;
  random?: () => number;
  policies?: Partial<Record<SocialPlatform, PublishPolicy>>;
  /** Publieur branché par l'appelant (API de la plateforme). Absent tant que le compte n'est pas connecté. */
  publisher?: (post: ScheduledPost) => Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class IAfluencerAgent {
  private readonly queue: ScheduledPost[] = [];
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly policies: Record<SocialPlatform, PublishPolicy>;

  constructor(private readonly deps: IAfluencerDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? Math.random;
    this.policies = { ...DEFAULT_POLICIES, ...deps.policies };
  }

  /** Planifie une publication à l'heure du prochain créneau libre, gigue comprise. */
  schedulePost(draft: PostDraft & { kind?: "post" | "story" }): ScheduledPost {
    validateDraft(draft);
    const now = this.now();
    const live = this.queue.filter((post) => post.platform === draft.platform && post.status !== "annulee");
    const latest = live.reduce<Date | null>((max, post) => (max === null || post.at > max ? post.at : max), null);
    const recentAt = live.filter((post) => post.at.getTime() >= now.getTime() - DAY_MS).map((post) => post.at);

    const post: ScheduledPost = {
      id: randomUUID(),
      platform: draft.platform,
      kind: draft.kind ?? "post",
      caption: draft.caption.trim(),
      mediaName: draft.mediaName,
      at: nextSlot({ requestedAt: now, lastAt: latest, recentAt, policy: this.policies[draft.platform], random: this.random }),
      status: "planifiee",
    };
    this.queue.push(post);
    return post;
  }

  /** Une story suit le même rythme qu'une publication, sur la même plateforme. */
  postStory(draft: PostDraft): ScheduledPost {
    return this.schedulePost({ ...draft, kind: "story" });
  }

  cancel(id: string): ScheduledPost {
    const post = this.find(id);
    if (post.status !== "planifiee") throw new IAfluencerError("Seule une publication planifiée peut être annulée.", 400);
    post.status = "annulee";
    return post;
  }

  list(): ScheduledPost[] {
    return [...this.queue].sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** Publie une entrée échue. Exige une validation humaine et un publieur branché. */
  async publish(id: string, approval: { approvedBy: string }): Promise<ScheduledPost> {
    if (!approval.approvedBy.trim()) throw new IAfluencerError("Validation humaine requise avant publication.", 400);
    const post = this.find(id);
    if (post.status !== "planifiee") throw new IAfluencerError("Cette publication n'est pas en attente.", 400);
    if (post.at.getTime() > this.now().getTime()) throw new IAfluencerError("L'heure de publication n'est pas encore atteinte.", 400);
    if (!this.deps.publisher) throw new IAfluencerError("Compte non connecté : aucun publieur n'est branché pour cette plateforme.", 400);
    await this.deps.publisher(post);
    post.status = "publiee";
    return post;
  }

  /** Stratégie de hashtags, description SEO et accroche, validées par schéma avant retour. */
  async generateStrategy(input: { platform: SocialPlatform; topic: string; brandNotes: string }): Promise<Strategy> {
    const topic = input.topic.trim();
    if (topic.length < 3 || topic.length > 300) throw new IAfluencerError("Le sujet doit faire entre 3 et 300 caractères.", 400);
    const raw = await this.ask(SYSTEM_PROMPT, JSON.stringify({ platform: input.platform, topic, brandNotes: input.brandNotes }));
    const parsed = StrategySchema.safeParse(raw);
    if (!parsed.success) throw new IAfluencerError("Réponse de l'IA hors schéma : stratégie rejetée.", 500);
    return parsed.data;
  }

  /** Brouillon de réponse à un commentaire. Il n'est jamais publié automatiquement. */
  async replyToComment(input: { platform: SocialPlatform; comment: string }): Promise<CommentReply> {
    const comment = input.comment.trim();
    if (comment.length === 0 || comment.length > 1000) throw new IAfluencerError("Le commentaire doit faire entre 1 et 1000 caractères.", 400);
    const raw = await this.ask(REPLY_PROMPT, JSON.stringify({ platform: input.platform, comment }));
    const parsed = CommentReplySchema.safeParse(raw);
    if (!parsed.success) throw new IAfluencerError("Réponse de l'IA hors schéma : brouillon rejeté.", 500);
    return parsed.data;
  }

  private find(id: string): ScheduledPost {
    const post = this.queue.find((item) => item.id === id);
    if (!post) throw new IAfluencerError("Publication introuvable.", 400);
    return post;
  }

  private async ask(system: string, user: string): Promise<unknown> {
    const client = this.deps.anthropic;
    if (!client) throw new IAfluencerError("Clé ANTHROPIC_API_KEY absente : génération indisponible.", 500);
    let text: string;
    try {
      const response = await client.messages.create({
        model: this.deps.model ?? DEFAULT_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: user }],
      });
      text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new IAfluencerError(`API Anthropic (HTTP ${error.status ?? "?"}).`, error.status === 400 ? 400 : 500);
      }
      throw new IAfluencerError("Appel à l'API Anthropic impossible.", 500);
    }
    return extractJson(text);
  }
}

function validateDraft(draft: PostDraft) {
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(draft.platform)) throw new IAfluencerError("Plateforme inconnue.", 400);
  const caption = draft.caption.trim();
  if (caption.length === 0) throw new IAfluencerError("La légende est vide.", 400);
  if (caption.length > CAPTION_MAX) throw new IAfluencerError(`La légende dépasse ${CAPTION_MAX} caractères.`, 400);
  if (!draft.mediaName.trim()) throw new IAfluencerError("Aucun média associé.", 400);
}

// Extrait l'objet JSON d'une réponse, même entourée de texte ou d'une clôture de code.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new IAfluencerError("Réponse de l'IA sans JSON.", 500);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new IAfluencerError("Réponse de l'IA : JSON invalide.", 500);
  }
}
