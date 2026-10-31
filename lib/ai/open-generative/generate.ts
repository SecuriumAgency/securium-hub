// Lance une génération et lit l'état d'une vidéo. Images : appel synchrone à OpenAI. Vidéos : prédiction
// Replicate asynchrone, dont l'état se lit par identifiant. Replicate.run attendrait la fin de la vidéo dans
// la même requête serveur : on crée la prédiction, puis on la lit.
import { IMAGE_MODEL, VIDEO_MODEL, getOpenAI, getReplicate } from "@/lib/ai/native-clients";
import type { GenerationRequest } from "./models";

export type StartedGeneration =
  | { status: "completed"; kind: "image"; url: string }
  | { status: "pending"; kind: "video"; request_id: string };

export type VideoState =
  | { status: "pending" }
  | { status: "completed"; url: string }
  | { status: "failed"; error: string };

export async function startGeneration(request: GenerationRequest): Promise<StartedGeneration> {
  if (request.kind === "image") return generateImage(request.prompt, request.size);
  return startVideo(request.prompt);
}

async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" | "1024x1536"): Promise<StartedGeneration> {
  const response = await getOpenAI().images.generate({ model: IMAGE_MODEL, prompt, size, n: 1 });

  // Selon le modèle, OpenAI renvoie l'image encodée en base64 ou une URL : les deux cas sont gérés.
  const image = response.data?.[0];
  if (image?.b64_json) return { status: "completed", kind: "image", url: `data:image/png;base64,${image.b64_json}` };
  if (image?.url) return { status: "completed", kind: "image", url: image.url };
  throw new Error("OpenAI n'a renvoyé aucune image.");
}

async function startVideo(prompt: string): Promise<StartedGeneration> {
  const prediction = await getReplicate().predictions.create({ model: VIDEO_MODEL, input: { prompt } });
  return { status: "pending", kind: "video", request_id: prediction.id };
}

export async function readVideo(requestId: string): Promise<VideoState> {
  const prediction = await getReplicate().predictions.get(requestId);

  if (prediction.status === "succeeded") {
    const url = firstUrl(prediction.output);
    return url ? { status: "completed", url } : { status: "failed", error: "Replicate a terminé sans fichier de sortie." };
  }
  if (prediction.status === "failed" || prediction.status === "canceled" || prediction.status === "aborted") {
    const error = typeof prediction.error === "string" ? prediction.error.slice(0, 300) : "Génération échouée.";
    return { status: "failed", error };
  }
  return { status: "pending" };
}

// La sortie vidéo de Replicate est une URL, ou une liste d'URL selon le modèle.
function firstUrl(output: unknown): string | undefined {
  const value = Array.isArray(output) ? output[0] : output;
  return typeof value === "string" && value.startsWith("https://") ? value : undefined;
}
