import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PublishError } from "@/lib/api/publish";
import { publishRushNow } from "@/lib/iafluencer-engine";

// Publication immédiate d'un rush sur Instagram, sur demande d'un administrateur. Session admin (middleware).
export const dynamic = "force-dynamic";

const BodySchema = z.object({ rushId: z.string().min(1).max(64) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Rush invalide." }, { status: 422 });

  try {
    const result = await publishRushNow(parsed.data.rushId);
    return NextResponse.json({ ok: true, mediaId: result.mediaId });
  } catch (error) {
    // Message explicite de l'API ou de la configuration : il n'expose ni jeton ni secret.
    if (error instanceof PublishError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error("[publish-now] échec :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Publication impossible." }, { status: 500 });
  }
}
