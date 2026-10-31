// Client MuAPI (api.muapi.ai) côté serveur : soumission d'une génération, puis lecture de son état.
// Adapté de Open-Generative-AI (licence MIT, voir ./LICENSE) : packages/studio/src/muapi.js,
// submitAndPoll et pollForGenerationResult. Le polling devient des lectures courtes, car une vidéo
// dure plusieurs minutes et une requête serveur ne peut pas attendre aussi longtemps.

const BASE_URL = "https://api.muapi.ai";
const TIMEOUT_MS = 20_000;
const SUCCESS_STATUSES = new Set(["completed", "succeeded", "success"]);
const FAILURE_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);

// L'identifiant renvoyé par MuAPI est recopié dans une URL : on n'accepte que des caractères sûrs.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type GenerationState =
  | { status: "pending" }
  | { status: "completed"; url: string }
  | { status: "failed"; error: string };

type MuapiResult = {
  status?: string;
  outputs?: string[];
  url?: string;
  output?: { url?: string };
  error?: string | { message?: string };
};

export async function submitGeneration(apiKey: string, endpoint: string, payload: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`MuAPI a refusé la génération (HTTP ${response.status}).`);

  const data = (await response.json()) as { request_id?: unknown; id?: unknown };
  const requestId = data.request_id ?? data.id;
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error("MuAPI n'a pas renvoyé d'identifiant de génération.");
  }
  return requestId;
}

export async function getGenerationState(apiKey: string, requestId: string): Promise<GenerationState> {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("Identifiant de génération invalide.");

  const response = await fetch(`${BASE_URL}/api/v1/predictions/${requestId}/result`, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Lecture de la génération refusée (HTTP ${response.status}).`);

  const result = (await response.json()) as MuapiResult;
  const status = result.status?.toLowerCase() ?? "";

  if (SUCCESS_STATUSES.has(status)) {
    const url = result.outputs?.[0] ?? result.url ?? result.output?.url;
    if (typeof url === "string" && url.startsWith("https://")) return { status: "completed", url };
    return { status: "failed", error: "MuAPI a terminé sans fichier de sortie." };
  }
  if (FAILURE_STATUSES.has(status)) return { status: "failed", error: errorMessage(result) };
  return { status: "pending" };
}

function errorMessage(result: MuapiResult) {
  if (typeof result.error === "string") return result.error.slice(0, 300);
  if (typeof result.error?.message === "string") return result.error.message.slice(0, 300);
  return "Génération échouée.";
}
