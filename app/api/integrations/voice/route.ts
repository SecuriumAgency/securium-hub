import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { callModule, invalidInput, moduleFailure, moduleUrl, notConfigured, NO_STORE, unauthorized, ModuleFailure } from "@/lib/integrations/bridge";

// Pont vers VoiceStudio : synthèse vocale. La réponse est le fichier audio lui-même, relayé tel quel.
export const dynamic = "force-dynamic";

// Une synthèse longue peut prendre plusieurs dizaines de secondes.
const SPEECH_TIMEOUT_MS = 60_000;

const speechBody = z.object({ text: z.string().trim().min(1).max(1000) });

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return unauthorized();

  const url = moduleUrl("VOICE_STUDIO");
  if (!url) return notConfigured("VoiceStudio", ["VOICE_STUDIO_URL"]);

  const body = speechBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidInput("Texte attendu, entre 1 et 1000 caractères.");

  const token = process.env.VOICE_STUDIO_API_KEY;
  try {
    const upstream = await callModule(
      "VoiceStudio",
      `${url}/api/speech`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: body.data.text }),
      },
      SPEECH_TIMEOUT_MS,
    );
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("audio/")) {
      await upstream.body?.cancel();
      throw new ModuleFailure("VoiceStudio n'a pas renvoyé d'audio.");
    }
    return new Response(upstream.body, { headers: { "Content-Type": type, ...NO_STORE } });
  } catch (error) {
    return moduleFailure(error);
  }
}
