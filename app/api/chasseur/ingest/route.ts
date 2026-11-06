import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/api-key";
import { ingestLead, parseIngest } from "@/lib/broker/ingest";

// Webhook d'acquisition : le module Chasseur envoie les leads trouvés. Authentifié par CHASSEUR_API_KEY, envoyée
// dans l'en-tête « Authorization: Bearer <clé> ». Ouvert au middleware (sans session), mais jamais sans cette clé.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.CHASSEUR_API_KEY?.trim();
  if (!secret) {
    console.error("[chasseur/ingest] CHASSEUR_API_KEY n'est pas défini : leads refusés.");
    return NextResponse.json({ error: "Ingestion non configurée." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = parseIngest(body);
  if (!parsed.success) {
    // Seuls le champ et le motif sortent : jamais la valeur reçue.
    const details = parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
    return NextResponse.json({ error: "Lead invalide.", details }, { status: 422 });
  }

  try {
    const result = await ingestLead(parsed.data);
    return NextResponse.json({ id: result.id, duplicate: !result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("[chasseur/ingest] enregistrement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
