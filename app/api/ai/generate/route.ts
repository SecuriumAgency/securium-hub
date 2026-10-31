import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { InvalidGenerationInput, buildGenerationRequest } from "@/lib/ai/open-generative/models";
import { REQUEST_ID_PATTERN, getGenerationState, submitGeneration } from "@/lib/ai/open-generative/muapi";

// Génération d'images, de vidéos et de lip sync via MuAPI, réservée à l'admin : middleware.ts exige la session,
// et la route la revérifie. La clé MUAPI_API_KEY reste sur le serveur, lue dans .env.local à chaque requête.
// Deux temps : POST soumet la génération et renvoie son request_id ; GET ?request_id=... lit son état.
// Une vidéo peut durer plusieurs minutes, plus longtemps qu'une requête serveur.
export const dynamic = "force-dynamic";

const submitBody = z.object({
  model: z.string().max(64),
  input: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MUAPI_API_KEY absente de .env.local." }, { status: 503 });

  const body = submitBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Requête invalide." }, { status: 422 });

  let generation: ReturnType<typeof buildGenerationRequest>;
  try {
    generation = buildGenerationRequest(body.data.model, body.data.input);
  } catch (error) {
    if (error instanceof InvalidGenerationInput) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }

  try {
    const requestId = await submitGeneration(apiKey, generation.endpoint, generation.payload);
    return NextResponse.json({ request_id: requestId, kind: generation.kind }, { status: 202 });
  } catch (error) {
    return upstreamFailure(error);
  }
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MUAPI_API_KEY absente de .env.local." }, { status: 503 });

  const requestId = new URL(request.url).searchParams.get("request_id") ?? "";
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return NextResponse.json({ error: "Identifiant de génération invalide." }, { status: 400 });
  }

  try {
    const state = await getGenerationState(apiKey, requestId);
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return upstreamFailure(error);
  }
}

// Un échec côté MuAPI devient un 502 : un 401 ou un 403 venant de MuAPI ferait croire au navigateur
// que la session admin a expiré.
function upstreamFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "MuAPI injoignable.";
  return NextResponse.json({ error: message }, { status: 502 });
}
