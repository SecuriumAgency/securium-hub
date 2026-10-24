import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-session";
import type { MessageRecord } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const PROSPECT_ID = /^[a-z0-9]{1,40}$/;

type Context = { params: Promise<{ prospectId: string }> };

// Historique des échanges d'un prospect (OutreachMessage), du plus ancien au plus récent, lu par le
// tiroir « Historique » de /admin/outreach.
// Réponse : { prospect: { id, company, email }, messages: [{ id, direction, subject, body, createdAt }] }.
export async function GET(_request: NextRequest, context: Context) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Session admin requise." }, { status: 401 });
  }
  const { prospectId } = await context.params;
  if (!PROSPECT_ID.test(prospectId)) {
    return NextResponse.json({ error: "Identifiant de prospect invalide." }, { status: 400 });
  }
  try {
    const prospect = await prisma.outreachProspect.findUnique({
      where: { id: prospectId },
      select: {
        id: true,
        company: true,
        email: true,
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, direction: true, subject: true, body: true, createdAt: true } },
      },
    });
    if (!prospect) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });
    const { messages, ...identity } = prospect;
    const records: MessageRecord[] = messages.map((message) => ({
      ...message,
      direction: message.direction as MessageRecord["direction"],
      createdAt: message.createdAt.toISOString(),
    }));
    return NextResponse.json({ prospect: identity, messages: records });
  } catch (error) {
    console.error("[messages] lecture impossible :", error);
    return NextResponse.json({ error: "Lecture de l'historique impossible." }, { status: 500 });
  }
}
