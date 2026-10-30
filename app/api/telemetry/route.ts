import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { parseTelemetryReport, type TelemetryResponse } from "@/lib/telemetry";
import { readStoredReport, STALE_AFTER_MS, writeStoredReport, type StoredReport } from "@/lib/telemetry-store";

const MAX_BODY_CHARS = 256 * 1024;
// Une clé courte se devinerait : en dessous, la réception reste fermée.
const MIN_KEY_LENGTH = 32;

// Appelée par le daemon securium-fleet-watch du poste, toutes les 10 s.
// Header attendu : `Authorization: Bearer <HUB_API_KEY>`.
export async function POST(request: NextRequest) {
  const secret = process.env.HUB_API_KEY;
  if (!secret || secret.length < MIN_KEY_LENGTH) {
    console.error(`[telemetry] HUB_API_KEY absent ou de moins de ${MIN_KEY_LENGTH} caractères : rapports refusés.`);
    return NextResponse.json({ error: "Réception de la télémétrie non configurée." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Rapport trop volumineux." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = parseTelemetryReport(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Rapport invalide.", details: parsed.errors }, { status: 422 });
  }

  const stored: StoredReport = { receivedAt: new Date().toISOString(), report: parsed.report };
  try {
    await writeStoredReport(stored);
  } catch (error) {
    console.error("[telemetry] enregistrement du rapport impossible :", error);
    return NextResponse.json({ error: "Enregistrement du rapport impossible." }, { status: 500 });
  }
  return NextResponse.json({ receivedAt: stored.receivedAt });
}

// Lue par le panneau « Agents » toutes les 10 s, derrière la session admin (middleware.ts).
export async function GET() {
  let stored: StoredReport | null;
  try {
    stored = await readStoredReport();
  } catch (error) {
    console.error("[telemetry] lecture du rapport impossible :", error);
    return NextResponse.json({ error: "Lecture de la télémétrie impossible." }, { status: 500 });
  }

  const now = Date.now();
  const body: TelemetryResponse = {
    reportedAt: stored?.receivedAt ?? null,
    stale: stored ? now - Date.parse(stored.receivedAt) > STALE_AFTER_MS : false,
    report: stored?.report ?? null,
    updatedAt: new Date(now).toISOString(),
  };
  return NextResponse.json(body);
}
