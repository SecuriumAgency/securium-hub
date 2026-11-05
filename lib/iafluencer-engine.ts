import { z } from "zod";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { generateSocialCaption } from "@/lib/agents/prompts/socialPrompt";
import { publishToInstagram, publishToTikTok, PublishError, type PublishFormat } from "@/lib/api/publish";
import { callMediaGenerationAPI, generateMediaPrompt, MediaGenerationError, topicForDate } from "@/lib/media/generator";
import { prisma } from "@/lib/prisma";
import { connectedAccounts, readSocialTokens } from "@/lib/social-accounts";

// Moteur IAfluencer : publications planifiées et Auto-Pilote. Appelé par /api/cron/publish, chaque heure.
// Règles de coût : aucune IA pour le calendrier, le sujet ou le filtrage ; une légende et un prompt média
// ne sont demandés qu'une fois et gardés sur la publication ; le compteur d'essais borne les relances.

const SETTINGS_ID = "default";
const MAX_PER_RUN = 3;
const MAX_ATTEMPTS = 4;
const HOUR_MS = 60 * 60 * 1000;

type SocialPostRow = NonNullable<Awaited<ReturnType<typeof prisma.socialPost.findFirst>>>;

export const SettingsSchema = z.object({
  artDirection: z.string().trim().max(600),
  brandVoice: z.string().trim().max(400),
  autopilotStories: z.boolean(),
  autopilotReels: z.boolean(),
});
export type IAfluencerSettingsInput = z.infer<typeof SettingsSchema>;

export async function readSettings(): Promise<IAfluencerSettingsInput> {
  const row = await prisma.iAfluencerSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    artDirection: row?.artDirection ?? "",
    brandVoice: row?.brandVoice ?? "",
    autopilotStories: row?.autopilotStories ?? false,
    autopilotReels: row?.autopilotReels ?? false,
  };
}

/** Bio commune de l'IAfluencer, vide tant qu'elle n'a pas été enregistrée. */
export async function readBio(): Promise<string> {
  const row = await prisma.iAfluencerSettings.findUnique({ where: { id: SETTINGS_ID }, select: { bio: true } });
  return row?.bio ?? "";
}

export async function saveSettings(input: IAfluencerSettingsInput): Promise<void> {
  await prisma.iAfluencerSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input },
    update: input,
  });
}

/** Jour de la semaine à Paris, sur trois lettres anglaises (Mon, Tue…). */
function parisWeekday(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(now);
}

/**
 * Crée les contenus de l'Auto-Pilote : une Story par jour, deux Reels par semaine (mardi et vendredi).
 * Rien n'est créé si un rush utilisateur est déjà planifié dans les 24 heures, ni sans fournisseur média.
 */
export async function createAutopilotPosts(now: Date): Promise<number> {
  const settings = await readSettings();
  if (!settings.autopilotStories && !settings.autopilotReels) return 0;
  if (!process.env.MEDIA_GENERATION_WEBHOOK_URL) return 0;

  const userPending = await prisma.socialPost.count({
    where: { source: "USER", status: "PENDING", scheduledAt: { lte: new Date(now.getTime() + 24 * HOUR_MS) } },
  });
  if (userPending > 0) return 0;

  const accounts = await connectedAccounts();
  const recent = (format: PublishFormat) =>
    prisma.socialPost.count({ where: { source: "AUTOPILOT", format, createdAt: { gte: new Date(now.getTime() - 20 * HOUR_MS) } } });

  const plan: { platform: SocialPlatform; format: PublishFormat }[] = [];
  if (settings.autopilotStories && accounts.has("instagram") && (await recent("STORIES")) === 0) {
    plan.push({ platform: "instagram", format: "STORIES" });
  }
  if (settings.autopilotReels && ["Tue", "Fri"].includes(parisWeekday(now)) && (await recent("REELS")) === 0) {
    for (const platform of ["instagram", "tiktok"] as const) {
      if (accounts.has(platform)) plan.push({ platform, format: "REELS" });
    }
  }

  const topic = topicForDate(now);
  for (const item of plan) {
    await prisma.socialPost.create({
      data: { platform: item.platform, format: item.format, source: "AUTOPILOT", niche: topic, scheduledAt: now, status: "PENDING" },
    });
  }
  return plan.length;
}

type Outcome = "published" | "failed" | "retrying";

/** Traite au plus MAX_PER_RUN publications dont l'heure est passée. Renvoie le bilan, sans aucun contenu. */
export async function publishDue(now: Date): Promise<{ processed: number; published: number; failed: number; retrying: number }> {
  const settings = await readSettings();
  const due = await prisma.socialPost.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: MAX_PER_RUN,
  });
  const summary = { processed: due.length, published: 0, failed: 0, retrying: 0 };
  for (const post of due) {
    const outcome: Outcome = await publishOne(post, settings, now);
    if (outcome === "published") summary.published++;
    else if (outcome === "failed") summary.failed++;
    else summary.retrying++;
  }
  return summary;
}

async function publishOne(post: SocialPostRow, settings: IAfluencerSettingsInput, now: Date): Promise<Outcome> {
  const attempts = post.attempts + 1;
  try {
    const caption = await ensureCaption(post, settings);
    const mediaUrl = await ensureMedia(post, settings, now);
    const providerId = await publishPost(post, caption, mediaUrl);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "PUBLISHED", providerId, publishedAt: new Date(), attempts, error: null },
    });
    return "published";
  } catch (error) {
    // Erreurs de publication et de média : leur drapeau décide. Autre erreur (réseau, IA) : nouvel essai.
    const retryable = error instanceof PublishError || error instanceof MediaGenerationError ? error.retryable : true;
    const message = error instanceof Error ? error.message.slice(0, 300) : "Erreur inconnue.";
    const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: giveUp ? "FAILED" : "PENDING", attempts, error: message },
    });
    console.error(`[publish:${post.platform}] ${giveUp ? "échec définitif" : "nouvel essai"} : ${message}`);
    return giveUp ? "failed" : "retrying";
  }
}

// La légende est demandée une seule fois, puis gardée sur la publication.
async function ensureCaption(post: SocialPostRow, settings: IAfluencerSettingsInput): Promise<string> {
  if (post.caption) return post.caption;
  const caption = await generateSocialCaption(post.rushName ?? "rush", post.niche ?? "cybersécurité", settings.brandVoice);
  await prisma.socialPost.update({ where: { id: post.id }, data: { caption } });
  return caption;
}

// Un rush utilisateur doit déjà avoir son fichier. Un contenu de l'Auto-Pilote est généré puis gardé.
async function ensureMedia(post: SocialPostRow, settings: IAfluencerSettingsInput, now: Date): Promise<string> {
  if (post.mediaUrl) return post.mediaUrl;
  if (post.source !== "AUTOPILOT") throw new PublishError("Aucun média pour cette publication.", "rejected", false);

  const prompt = post.mediaPrompt ?? (await generateMediaPrompt(post.niche ?? topicForDate(now), settings.artDirection));
  if (!post.mediaPrompt) await prisma.socialPost.update({ where: { id: post.id }, data: { mediaPrompt: prompt } });
  const mediaUrl = await callMediaGenerationAPI(prompt, "9:16");
  await prisma.socialPost.update({ where: { id: post.id }, data: { mediaUrl } });
  return mediaUrl;
}

async function publishPost(post: SocialPostRow, caption: string, mediaUrl: string): Promise<string> {
  const platform = post.platform as SocialPlatform;
  const tokens = await readSocialTokens(platform);
  if (!tokens) throw new PublishError(`Compte ${platform} non connecté.`, "rejected", false);

  if (platform === "instagram") {
    const account = (await connectedAccounts()).get("instagram");
    if (!account?.externalId) throw new PublishError("Identifiant Instagram manquant : reconnectez le compte.", "token_expired", false);
    return publishToInstagram({
      igUserId: account.externalId,
      mediaUrl,
      caption,
      format: post.format as PublishFormat,
      accessToken: tokens.accessToken,
    });
  }
  return publishToTikTok({ mediaUrl, caption, accessToken: tokens.accessToken });
}
