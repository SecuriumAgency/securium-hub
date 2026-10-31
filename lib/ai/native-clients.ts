// Clients des SDK officiels : OpenAI pour les images, Replicate pour les vidéos.
// Les clés sont lues dans l'environnement du serveur (.env.local en local), jamais écrites dans le code.
import OpenAI from "openai";
import Replicate from "replicate";

// DALL-E 3 a été retiré de l'API le 12 mai 2026 (page des dépréciations d'OpenAI) : gpt-image-2 le remplace.
export const IMAGE_MODEL = "gpt-image-2";
// Identifiant owner/name sur Replicate, sans version figée : Replicate lance la dernière version publiée.
export const VIDEO_MODEL = "minimax/video-01";

const REQUIRED_API_KEYS = ["OPENAI_API_KEY", "REPLICATE_API_TOKEN"] as const;

// Noms des clés absentes. Les valeurs ne sont jamais affichées.
export function missingApiKeys(): string[] {
  return REQUIRED_API_KEYS.filter((name) => !process.env[name]);
}

// Créés à la première demande, pas à l'import : importer ce module pendant le build ne doit pas exiger les clés.
let openai: OpenAI | undefined;
let replicate: Replicate | undefined;

export function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY absente de .env.local.");
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export function getReplicate(): Replicate {
  if (!replicate) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error("REPLICATE_API_TOKEN absente de .env.local.");
    replicate = new Replicate({ auth });
  }
  return replicate;
}
