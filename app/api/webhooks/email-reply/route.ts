import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/api-key";
import { messageIdFromHeaders, parseResendEvent, parseSendgridEnvelopeTo, ResendReceivedBody, verifySvixSignature } from "@/lib/inbound-mail";
import { isOutreachAddress, normalizeEmail } from "@/lib/outreach";
import { recordInboundReply, type InboundOutcome } from "@/lib/outreach-inbound";

// Réponses des prospects, reçues du sous-domaine de prospection (outreach.securium-agency.fr). Deux fournisseurs,
// reconnus au format de la requête :
// - Resend (application/json, événement « email.received ») : signature Svix avec RESEND_WEBHOOK_SECRET ; le corps
//   se lit ensuite sur l'API de réception, avec RESEND_API_KEY. Si la lecture échoue, la route répond 500 : Resend
//   renvoie l'événement.
// - SendGrid Inbound Parse (multipart/form-data, format « parsed », sans « POST the raw, full MIME message ») :
//   pas de signature chez SendGrid. Le secret est dans l'URL : …/api/webhooks/email-reply?key=<INBOUND_WEBHOOK_SECRET>.
// Route publique (middleware, PUBLIC_POSTS) : chaque chemin vérifie son propre secret. Sans secret : 503.
export const dynamic = "force-dynamic";

type Provider = "resend" | "sendgrid";

// Journal : domaine de l'expéditeur et identifiant de la fiche, jamais l'adresse complète ni le contenu.
function logOutcome(provider: Provider, from: string, outcome: InboundOutcome) {
  const senderDomain = normalizeEmail(from).split("@")[1] ?? null;
  const line =
    outcome.status === "recorded"
      ? { evt: "inbound.reply", provider, status: "recorded", prospect: outcome.prospectId, senderDomain, applied: outcome.applied, stop: outcome.stop }
      : { evt: "inbound.reply", provider, status: outcome.status, senderDomain };
  console.log(JSON.stringify(line));
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) return await fromResend(request);
    if (contentType.includes("multipart/form-data")) return await fromSendgrid(request);
    return NextResponse.json({ error: "Format non pris en charge." }, { status: 415 });
  } catch (error) {
    // Seul le message sort dans les journaux : ni adresse, ni contenu.
    console.error("[webhook] réponse non traitée :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}

async function fromResend(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret || !apiKey) return NextResponse.json({ error: "Réception Resend non configurée." }, { status: 503 });

  // Corps brut : la signature porte sur les octets exacts reçus.
  const raw = await request.text();
  const valid = verifySvixSignature({
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body: raw,
    secret,
  });
  if (!valid) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const event = parseResendEvent(payload);
  // Autre événement, ou un message qui n'est pas adressé au sous-domaine : rien à faire, réponse 200.
  if (!event || !event.to.some((address) => isOutreachAddress(address))) {
    console.log(JSON.stringify({ evt: "inbound.reply", provider: "resend", status: "ignored" }));
    return NextResponse.json({ status: "ignored" });
  }

  // Le webhook ne porte que les métadonnées : le corps se lit sur l'API de réception.
  const received = ResendReceivedBody.parse(await fetchResendReceived(event.emailId, apiKey));
  const createdAt = event.createdAt ? new Date(event.createdAt) : null;
  const outcome = await recordInboundReply({
    from: event.from,
    subject: received.subject ?? event.subject,
    text: received.text,
    html: received.html,
    messageId: received.message_id ?? event.messageId,
    date: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
  });
  logOutcome("resend", event.from, outcome);
  return NextResponse.json({ status: outcome.status });
}

async function fetchResendReceived(emailId: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`lecture du message reçu : Resend a répondu ${response.status}`);
  return response.json();
}

async function fromSendgrid(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Réception SendGrid non configurée." }, { status: 503 });
  if (!secretMatches(request.nextUrl.searchParams.get("key") ?? "", secret)) {
    return NextResponse.json({ error: "Clé invalide." }, { status: 401 });
  }

  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const recipients = parseSendgridEnvelopeTo(field("envelope"));
  if (!recipients.some((address) => isOutreachAddress(address))) {
    console.log(JSON.stringify({ evt: "inbound.reply", provider: "sendgrid", status: "ignored" }));
    return NextResponse.json({ status: "ignored" });
  }

  const outcome = await recordInboundReply({
    from: field("from"),
    subject: field("subject"),
    text: field("text"),
    html: field("html"),
    messageId: messageIdFromHeaders(field("headers")),
    date: null,
  });
  logOutcome("sendgrid", field("from"), outcome);
  return NextResponse.json({ status: outcome.status });
}
