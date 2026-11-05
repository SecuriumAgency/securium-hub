import Anthropic from "@anthropic-ai/sdk";
import { CAPTION_MODEL } from "@/lib/agents/prompts/socialPrompt";

// Génération autonome de contenu pour l'Auto-Pilote (Stories et Reels verticaux 9:16).
// Le sujet est tiré par le code, sans IA. L'IA ne sert qu'à écrire le prompt média, une fois : le prompt
// est gardé sur la publication et jamais réécrit.

export const AUTOPILOT_TOPICS = [
  "cybersécurité pour les PME",
  "mots de passe et double authentification",
  "sauvegardes et protection contre les rançongiciels",
  "télétravail sécurisé",
  "phishing : reconnaître un faux message",
  "automatisation des tâches administratives",
  "tendances tech de la semaine",
  "sites web rapides et visibles sur Google",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sujet du jour, choisi par rotation sur le calendrier : déterministe et sans coût. */
export function topicForDate(date: Date): string {
  const day = Math.floor(date.getTime() / DAY_MS);
  return AUTOPILOT_TOPICS[day % AUTOPILOT_TOPICS.length];
}

export const MEDIA_PROMPT_SYSTEM =
  "Tu écris un prompt de génération vidéo verticale 9:16 ou image verticale. Réponds uniquement par le prompt, en anglais, 60 mots maximum, sans introduction.";

/** Prompt média pour un sujet, dans la direction artistique de la marque. Appel unique par publication. */
export async function generateMediaPrompt(topic: string, daMasterPrompt: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 200,
    system: MEDIA_PROMPT_SYSTEM,
    messages: [{ role: "user", content: `Sujet : ${topic}\nDirection artistique : ${daMasterPrompt}` }],
  });
  const text = response.content.find((block) => block.type === "text")?.text.trim() ?? "";
  if (!text) throw new Error("Prompt média vide renvoyé par l'IA.");
  return text;
}

export class MediaGenerationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MediaGenerationError";
  }
}

/**
 * Point d'entrée vers un fournisseur de génération vidéo (Replicate, OpenAI, Luma, Kling…) via un webhook
 * qui reçoit { prompt, format } et renvoie { url } : l'URL HTTPS du fichier 9:16 généré.
 * Sans MEDIA_GENERATION_WEBHOOK_URL, rien n'est généré : l'erreur est explicite et sans coût.
 */
export async function callMediaGenerationAPI(prompt: string, format: "9:16"): Promise<string> {
  const webhook = process.env.MEDIA_GENERATION_WEBHOOK_URL;
  if (!webhook) throw new MediaGenerationError("Aucun fournisseur de génération média configuré.", false);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.MEDIA_GENERATION_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;

  const response = await fetch(webhook, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, format }),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new MediaGenerationError(`Fournisseur média en erreur (HTTP ${response.status}).`, response.status >= 500);

  const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof body?.url !== "string" || !body.url.startsWith("https://")) {
    throw new MediaGenerationError("Le fournisseur média n'a pas renvoyé d'URL HTTPS.", false);
  }
  return body.url;
}
