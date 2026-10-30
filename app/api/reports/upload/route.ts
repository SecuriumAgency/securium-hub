import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { prisma } from "@/lib/prisma";

// Un rapport quotidien pèse quelques centaines de Ko : au-delà, ce n'est pas un rapport.
const MAX_BYTES = 5 * 1024 * 1024;
// Une clé courte se devinerait : en dessous, la réception reste fermée (même règle que /api/telemetry).
const MIN_KEY_LENGTH = 32;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PDF_SIGNATURE = Buffer.from("%PDF-");

// Appelée par agents/reporter/generate-pdf.ts (Securium-OS), sans session : HUB_API_KEY la protège.
// Formulaire multipart : `file` (le PDF) et `date` (AAAA-MM-JJ). Un envoi du même jour remplace le précédent.
export async function POST(request: NextRequest) {
  const secret = process.env.HUB_API_KEY;
  if (!secret || secret.length < MIN_KEY_LENGTH) {
    console.error(`[reports] HUB_API_KEY absent ou de moins de ${MIN_KEY_LENGTH} caractères : rapports refusés.`);
    return NextResponse.json({ error: "Réception des rapports non configurée." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  // Marge de 64 Ko pour l'enveloppe multipart, en plus du fichier lui-même.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Rapport trop volumineux." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire multipart attendu." }, { status: 400 });
  }

  const file = form.get("file");
  const date = form.get("date");
  if (!(file instanceof File) || typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: "Champs file (PDF) et date (AAAA-MM-JJ) requis." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Rapport trop volumineux." }, { status: 413 });
  }
  const content = Buffer.from(await file.arrayBuffer());
  if (!content.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    return NextResponse.json({ error: "Le fichier n'est pas un PDF." }, { status: 422 });
  }

  try {
    const saved = await prisma.dailyReport.upsert({
      where: { date },
      create: { date, sizeBytes: content.length, content },
      update: { sizeBytes: content.length, content, receivedAt: new Date() },
      select: { date: true, sizeBytes: true, receivedAt: true },
    });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[reports] enregistrement du rapport impossible :", error);
    return NextResponse.json({ error: "Enregistrement du rapport impossible." }, { status: 500 });
  }
}
