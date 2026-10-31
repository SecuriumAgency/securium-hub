// Demandes de génération acceptées par le hub. Le client choisit seulement le type (image ou vidéo) :
// le modèle est fixé côté serveur (lib/ai/native-clients.ts), donc un champ `model` envoyé par le client est ignoré.
import { z } from "zod";

// Espaces réduits et bords coupés, avant de vérifier les bornes.
const prompt = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "Le prompt doit faire au moins 2 caractères.").max(2000, "Le prompt dépasse 2000 caractères."));

const imageRequest = z.object({
  kind: z.literal("image"),
  prompt,
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
});

const videoRequest = z.object({
  kind: z.literal("video"),
  prompt,
});

export const generationRequest = z.discriminatedUnion("kind", [imageRequest, videoRequest]);

export type GenerationRequest = z.infer<typeof generationRequest>;
