import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/api-key";
import { recordInboundReply } from "@/lib/outreach-inbound";

// Webhook des réponses de prospects. Route publique (middleware, PUBLIC_POSTS) : elle est protégée ici par
// INBOUND_WEBHOOK_SECRET, en `Authorization: Bearer <secret>`. Sans secret configuré, elle refuse tout (503).
// Corps JSON : { from, subject?, text?, html?, messageId?, date? }. Le relais d'emails entrants (Resend Inbound,
// SendGrid Inbound Parse, ou un relais maison) doit transmettre cette forme : un adaptateur reste à écrire pour le
// fournisseur retenu, et la réception exige un domaine dont le MX pointe vers lui.
export const dynamic = "force-dynamic";

const ReplySchema = z.object({
  from: z.string().min(3).max(320),
  subject: z.string().max(998).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(200_000).optional(),
  messageId: z.string().max(998).optional(),
  date: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Clé d'API invalide." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réponse mal formée." }, { status: 422 });
  const reply = parsed.data;
  const date = reply.date ? new Date(reply.date) : null;

  try {
    // Un expéditeur inconnu répond 200 : le relais ne doit pas renvoyer ce qui n'intéresse pas le Hub.
    const outcome = await recordInboundReply({ ...reply, date: date && !Number.isNaN(date.getTime()) ? date : null });
    return NextResponse.json(outcome);
  } catch (error) {
    // Seul le message sort dans les journaux : ni adresse, ni contenu.
    console.error("[webhook] réponse non enregistrée :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
