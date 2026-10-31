// Modèles de génération exposés par le hub, et mise en forme de leurs requêtes.
// Adapté de Open-Generative-AI (licence MIT, voir ./LICENSE) : endpoints et paramètres relevés dans
// packages/studio/src/models.js (t2iModels, t2vModels, lipsyncModels). Seuls ces modèles sont repris ;
// le catalogue complet, de plus de 35 000 lignes, n'est pas copié.
import { z } from "zod";

// Espaces réduits et bords coupés, avant de vérifier les bornes de l'API.
const normalizePrompt = (value: string) => value.replace(/\s+/g, " ").trim();

const prompt = z
  .string()
  .transform(normalizePrompt)
  .pipe(z.string().min(2, "Le prompt doit faire au moins 2 caractères.").max(3000, "Le prompt dépasse 3000 caractères."));

// Lip sync : le prompt est facultatif, une chaîne vide reste acceptée.
const optionalPrompt = z
  .string()
  .transform(normalizePrompt)
  .pipe(z.string().max(3000, "Le prompt dépasse 3000 caractères."));

// Fichiers d'entrée : URL https publique. MuAPI ne lit pas les chemins locaux.
const httpsUrl = z.url({ protocol: /^https$/, error: "URL https attendue." });

const dimension = z.number().int().min(128).max(2048).multipleOf(64).default(1024);

export const GENERATION_MODELS = {
  "nano-banana": {
    kind: "image",
    endpoint: "nano-banana",
    input: z.object({
      prompt,
      aspect_ratio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"]).default("1:1"),
    }),
  },
  "flux-dev": {
    kind: "image",
    endpoint: "flux-dev-image",
    input: z.object({ prompt, width: dimension, height: dimension }),
  },
  "seedance-lite-t2v": {
    kind: "video",
    endpoint: "seedance-lite-t2v",
    input: z.object({
      prompt,
      aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4", "9:21"]).default("16:9"),
      duration: z.number().int().min(3).max(12).default(5),
      resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
    }),
  },
  "kling-v2.6-pro-t2v": {
    kind: "video",
    endpoint: "kling-v2.6-pro-t2v",
    input: z.object({
      prompt,
      aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
      duration: z.union([z.literal(5), z.literal(10)]).default(5),
    }),
  },
  "infinitetalk-image-to-video": {
    kind: "lipsync",
    endpoint: "infinitetalk-image-to-video",
    input: z.object({
      image_url: httpsUrl,
      audio_url: httpsUrl,
      prompt: optionalPrompt.default(""),
      resolution: z.enum(["480p", "720p"]).default("480p"),
    }),
  },
  "wan2.2-speech-to-video": {
    kind: "lipsync",
    endpoint: "wan2.2-speech-to-video",
    input: z.object({
      image_url: httpsUrl,
      audio_url: httpsUrl,
      prompt: optionalPrompt.default(""),
      resolution: z.enum(["480p", "720p"]).default("480p"),
    }),
  },
} as const;

export type GenerationModelId = keyof typeof GENERATION_MODELS;

export class InvalidGenerationInput extends Error {}

// Valide les paramètres du modèle demandé et renvoie l'endpoint MuAPI et le corps de la requête.
export function buildGenerationRequest(modelId: string, input: unknown) {
  if (!Object.hasOwn(GENERATION_MODELS, modelId)) throw new InvalidGenerationInput("Modèle inconnu.");

  const model = GENERATION_MODELS[modelId as GenerationModelId];
  const parsed = model.input.safeParse(input);
  if (!parsed.success) throw new InvalidGenerationInput(parsed.error.issues[0]?.message ?? "Paramètres invalides.");

  return { kind: model.kind, endpoint: model.endpoint, payload: parsed.data as Record<string, unknown> };
}
