import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bioErrors, SOCIAL_PLATFORMS } from "@/lib/agents/iafluencer-rules";
import { connectedAccounts } from "@/lib/social-accounts";
import { prisma } from "@/lib/prisma";

// Bio commune IAfluencer. Enregistrée dans le Hub. Meta (Instagram) et TikTok n'offrent pas d'API publique pour
// modifier la biographie d'un compte : la réponse le dit explicitement, et le texte est à copier dans chaque profil.
// Session admin (middleware).
const BioSchema = z.object({ bio: z.string().max(500) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = BioSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bio invalide." }, { status: 422 });
  const bio = parsed.data.bio.trim();

  // Limites par plateforme, comptées en caractères et non en octets.
  const problems = SOCIAL_PLATFORMS.flatMap((platform) => bioErrors(platform, bio));
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" ") }, { status: 422 });

  try {
    const accounts = await connectedAccounts();
    if (accounts.size === 0) {
      return NextResponse.json({ error: "Aucun compte connecté : connectez Instagram ou TikTok d'abord." }, { status: 409 });
    }
    await prisma.iAfluencerSettings.upsert({
      where: { id: "default" },
      create: { id: "default", bio },
      update: { bio },
    });
    return NextResponse.json({
      ok: true,
      pushed: false,
      reason: "api_non_disponible",
      message: "Bio enregistrée dans le Hub. Meta et TikTok n'autorisent pas sa modification par API : copiez-la dans chaque profil.",
    });
  } catch (error) {
    console.error("[social] bio impossible à enregistrer :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
