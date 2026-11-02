import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { generateImageOnPremise } from "@/lib/integrations/local-image-ai";

// Génération d'images sur le nœud IA local, réservée à l'admin. Le serveur du Hub appelle le nœud :
// son adresse ne passe jamais par le navigateur. Le nœud ne tourne que sur cette machine (127.0.0.1).
export const dynamic = "force-dynamic";

const FORMATS = {
  carre: { width: 512, height: 512 },
  portrait: { width: 512, height: 768 },
  paysage: { width: 768, height: 512 },
} as const;

const requestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "Décrivez l'image à générer.")
    .max(1000, "Prompt trop long (1000 caractères maximum)."),
  format: z.enum(["carre", "portrait", "paysage"]),
});

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Requête invalide." }, { status: 422 });
  }

  const result = await generateImageOnPremise(body.data.prompt, FORMATS[body.data.format]);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ imageBase64: result.imageBase64 }, { headers: { "Cache-Control": "no-store" } });
}
