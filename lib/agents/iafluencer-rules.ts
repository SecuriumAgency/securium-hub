// Règles pures de l'IAfluencer : planification, bornes des textes, schémas des réponses de l'IA.
// Ce fichier n'importe ni le SDK Anthropic ni aucun module Node : il sert côté serveur comme côté navigateur.
import { z } from "zod";

export const SOCIAL_PLATFORMS = ["instagram", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = { instagram: "Instagram", tiktok: "TikTok" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Espacement minimal entre deux publications, gigue aléatoire ajoutée, nombre maximal sur 24 h.
// Ce sont des valeurs prudentes, à ajuster : ce ne sont pas des quotas publiés par Meta ou TikTok.
// Le délai aléatoire sert à garder un rythme régulier sous ces bornes, pas à contourner une détection.
export type PublishPolicy = { minGapMs: number; jitterMs: number; maxPerDay: number };

export const DEFAULT_POLICIES: Record<SocialPlatform, PublishPolicy> = {
  instagram: { minGapMs: 4 * HOUR, jitterMs: 45 * MINUTE, maxPerDay: 2 },
  tiktok: { minGapMs: 3 * HOUR, jitterMs: 40 * MINUTE, maxPerDay: 3 },
};

export type SlotInput = {
  requestedAt: Date;
  // Dernière publication planifiée sur la plateforme, null s'il n'y en a aucune.
  lastAt: Date | null;
  // Publications des dernières 24 h, dans un ordre quelconque.
  recentAt: Date[];
  policy: PublishPolicy;
  // Générateur de nombres entre 0 (inclus) et 1 (exclu). Injectable pour les tests.
  random: () => number;
};

// Prochain créneau. Il respecte l'espacement minimal, le plafond sur 24 h, puis ajoute une gigue : le
// résultat n'est jamais antérieur à la demande.
export function nextSlot(input: SlotInput): Date {
  const { requestedAt, lastAt, recentAt, policy, random } = input;
  const candidates = [requestedAt.getTime()];
  if (lastAt) candidates.push(lastAt.getTime() + policy.minGapMs);

  const sorted = [...recentAt].map((date) => date.getTime()).sort((a, b) => a - b);
  if (sorted.length >= policy.maxPerDay) {
    // Le plafond se libère quand la publication la plus ancienne qui fait dépasser la limite sort de la fenêtre.
    candidates.push(sorted[sorted.length - policy.maxPerDay] + DAY);
  }

  const jitter = Math.floor(clampUnit(random()) * policy.jitterMs);
  return new Date(Math.max(...candidates) + jitter);
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 0.999999);
}

// Bornes des biographies : Instagram et TikTok n'acceptent pas davantage.
export const BIO_LIMITS: Record<SocialPlatform, number> = { instagram: 150, tiktok: 80 };
export const CAPTION_MAX = 2200;

export function bioErrors(platform: SocialPlatform, bio: string): string[] {
  const length = [...bio.trim()].length;
  if (length > BIO_LIMITS[platform]) return [`${PLATFORM_LABELS[platform]} : ${length} caractères, maximum ${BIO_LIMITS[platform]}.`];
  return [];
}

// Réponse de l'IA pour une stratégie de publication. Toute réponse hors de ce schéma est rejetée.
export const StrategySchema = z.object({
  hashtags: z.array(z.string().trim().min(2).max(40)).min(3).max(15),
  seoDescription: z.string().trim().min(40).max(CAPTION_MAX),
  captionHook: z.string().trim().min(5).max(150),
});
export type Strategy = z.infer<typeof StrategySchema>;

// Réponse de l'IA à un commentaire : un brouillon de réponse, jamais publié sans validation humaine.
export const CommentReplySchema = z.object({
  reply: z.string().trim().min(2).max(300),
});
export type CommentReply = z.infer<typeof CommentReplySchema>;

// Publication planifiée, telle que la file la garde.
export type ScheduledPost = {
  id: string;
  platform: SocialPlatform;
  kind: "post" | "story";
  caption: string;
  mediaName: string;
  // Heure de publication prévue, après gigue.
  at: Date;
  status: "planifiee" | "publiee" | "annulee";
};
