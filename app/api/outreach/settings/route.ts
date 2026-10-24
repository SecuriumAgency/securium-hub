import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import { AGENT_SETTINGS_ID, parseAgentBrief } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

const MAX_BODY_CHARS = 16 * 1024;
// Champs renvoyés : l'id de la ligne unique ne regarde pas le client.
const SELECT = { productDescription: true, targetAudience: true, updatedAt: true } as const;
const unauthorized = () => NextResponse.json({ error: "Session admin requise." }, { status: 401 });

// Brief de l'agent Chasseur (ce qu'on vend, le client idéal), lu et enregistré depuis /admin/outreach.
// Réponse : { settings: { productDescription, targetAudience, updatedAt } | null }.
export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();
  try {
    const settings = await prisma.agentSettings.findUnique({ where: { id: AGENT_SETTINGS_ID }, select: SELECT });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[settings] lecture impossible :", error);
    return NextResponse.json({ error: "Lecture du brief impossible." }, { status: 500 });
  }
}

// Corps : { productDescription, targetAudience }. JSON seulement : un formulaire d'un autre site ne peut
// pas en envoyer sans contrôle préalable du navigateur.
export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Corps JSON attendu." }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Brief trop volumineux." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = parseAgentBrief(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Brief invalide.", details: parsed.errors }, { status: 422 });
  }
  try {
    const settings = await prisma.agentSettings.upsert({
      where: { id: AGENT_SETTINGS_ID },
      create: { id: AGENT_SETTINGS_ID, ...parsed.brief },
      update: parsed.brief,
      select: SELECT,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[settings] enregistrement impossible :", error);
    return NextResponse.json({ error: "Enregistrement du brief impossible." }, { status: 500 });
  }
}
