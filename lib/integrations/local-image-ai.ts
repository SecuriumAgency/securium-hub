import { callModule, ModuleFailure, moduleUrl } from "@/lib/integrations/bridge";

// Génération d'images sur le nœud IA local (Stable Diffusion WebUI, dépôt securium-ai-node).
// Appel serveur uniquement : l'adresse du nœud et sa réponse ne passent jamais par le navigateur.
// Un conteneur éteint ou lent ne fait pas planter l'interface : la fonction renvoie un échec, elle ne lève rien.

// Une image sur GPU peut prendre plusieurs dizaines de secondes.
const GENERATION_TIMEOUT_MS = 120_000;

export type LocalImageResult = { ok: true; imageBase64: string } | { ok: false; error: string };

// Dimensions et nombre d'étapes facultatifs : le nœud applique ses valeurs par défaut sinon.
export type LocalImageOptions = { width?: number; height?: number; steps?: number };

export async function generateImageOnPremise(prompt: string, options: LocalImageOptions = {}): Promise<LocalImageResult> {
  const text = prompt.trim();
  if (!text) return { ok: false, error: "Prompt vide." };

  const url = moduleUrl("LOCAL_IMAGE_GEN");
  if (!url) return { ok: false, error: "Génération locale non configurée : renseigner LOCAL_IMAGE_GEN_URL." };

  try {
    const response = await callModule(
      "Génération d'images locale",
      `${url}/sdapi/v1/txt2img`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, ...options }),
      },
      GENERATION_TIMEOUT_MS,
    );
    const data = (await response.json()) as { images?: unknown };
    const first = Array.isArray(data.images) ? data.images[0] : undefined;
    if (typeof first !== "string" || !first) {
      return { ok: false, error: "Le nœud IA n'a renvoyé aucune image." };
    }
    return { ok: true, imageBase64: first };
  } catch (error) {
    if (error instanceof ModuleFailure) return { ok: false, error: error.message };
    return { ok: false, error: "Réponse inattendue du nœud IA." };
  }
}
