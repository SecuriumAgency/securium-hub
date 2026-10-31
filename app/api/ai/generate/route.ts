import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { missingApiKeys } from "@/lib/ai/native-clients";
import { generationRequest } from "@/lib/ai/open-generative/models";
import { readVideo, startGeneration } from "@/lib/ai/open-generative/generate";

// Génération d'images (OpenAI) et de vidéos (Replicate), réservée à l'admin : middleware.ts exige la session,
// et la route la revérifie. Les clés restent sur le serveur, lues dans .env.local.
// POST lance la génération : 200 avec l'URL pour une image, 202 avec un request_id pour une vidéo.
// GET ?request_id=... lit l'état d'une vidéo.
export const dynamic = "force-dynamic";

// Identifiants de prédiction Replicate : lettres, chiffres, tirets et underscores.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const body = generationRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Requête invalide." }, { status: 422 });
  }

  try {
    const started = await startGeneration(body.data);
    return NextResponse.json(started, { status: started.status === "completed" ? 200 : 202 });
  } catch (error) {
    return upstreamFailure(error);
  }
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const requestId = new URL(request.url).searchParams.get("request_id") ?? "";
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return NextResponse.json({ error: "Identifiant de génération invalide." }, { status: 400 });
  }

  try {
    const state = await readVideo(requestId);
    return NextResponse.json({ kind: "video", ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return upstreamFailure(error);
  }
}

// Session admin, puis présence des deux clés : sans l'une d'elles, erreur 500 explicite.
async function guard(): Promise<NextResponse | null> {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const missing = missingApiKeys();
  if (missing.length > 0) {
    return NextResponse.json({ error: `Clés API absentes de .env.local : ${missing.join(", ")}.` }, { status: 500 });
  }
  return null;
}

// Un échec chez OpenAI ou Replicate devient un 502 : un 401 venant d'eux ferait croire au navigateur
// que la session admin a expiré.
function upstreamFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Fournisseur de génération injoignable.";
  return NextResponse.json({ error: message }, { status: 502 });
}
