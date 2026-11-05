import Anthropic from "@anthropic-ai/sdk";

// Légende des publications IAfluencer. Prompt volontairement court : chaque token d'entrée se paie.
// Le résultat est stocké sur la publication (SocialPost.caption) et n'est jamais redemandé.

export const CAPTION_MODEL = "claude-haiku-5-5";

export const SOCIAL_CAPTION_SYSTEM =
  "Tu es un Social Media Manager Expert. À partir du nom du fichier vidéo et de la niche, génère une légende engageante avec des emojis et une stratégie de 5 à 7 hashtags optimisés. Ne réponds que par le texte de la légende, sans introduction.";

/** Légende pour un rush ou un contenu de l'Auto-Pilote. Lève une erreur si l'IA ne renvoie rien d'utilisable. */
export async function generateSocialCaption(rushName: string, niche: string, brandVoice: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 400,
    system: SOCIAL_CAPTION_SYSTEM,
    messages: [{ role: "user", content: `Fichier : ${rushName}\nNiche : ${niche}${brandVoice ? `\nVoix : ${brandVoice}` : ""}` }],
  });
  const text = response.content.find((block) => block.type === "text")?.text.trim() ?? "";
  if (!text) throw new Error("Légende vide renvoyée par l'IA.");
  return text;
}
