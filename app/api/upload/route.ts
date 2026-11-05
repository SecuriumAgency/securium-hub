import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { ACCEPTED_VIDEO_EXTENSIONS, MAX_RUSH_BYTES } from "@/lib/media/upload-rules";

// Jeton d'envoi direct vers Vercel Blob. Le fichier ne transite pas par cette route : un rush de 2 Go
// dépasse la limite de corps d'une route serverless. Réservé à la session admin (middleware).
export const dynamic = "force-dynamic";

const PATHNAME = /^rushs\/[A-Za-z0-9._-]{1,120}\.(mp4|mov)$/;

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Stockage des rushs non configuré (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const lower = pathname.toLowerCase();
        if (!PATHNAME.test(pathname) || !ACCEPTED_VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
          throw new Error("Format non accepté : .mp4 ou .mov uniquement.");
        }
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime"],
          maximumSizeInBytes: MAX_RUSH_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    // Le message décrit le refus, sans aucune donnée d'accès au stockage.
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi refusé." }, { status: 400 });
  }
}
