import { NextResponse, type NextRequest } from "next/server";
import { saveSettings, SettingsSchema } from "@/lib/iafluencer-engine";

// Réglages de l'IAfluencer : direction artistique, voix de marque, interrupteurs de l'Auto-Pilote.
// Réservé à la session admin (middleware).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réglages invalides." }, { status: 422 });
  try {
    await saveSettings(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[iafluencer] enregistrement des réglages impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
