import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { OPT_OUT_FOOTER } from "./chasseur";

// Réception des réponses de prospects : signature et format du fournisseur, et lecture du seul texte nouveau.
// Module pur : aucun appel réseau ni base ici.

// Le texte cité (réponse à notre email, qui contient la mention « STOP » du pied de page) ne compte pas : un prospect
// qui répond à une question ne doit pas être désinscrit par la citation de notre propre email.
const QUOTE_START = [
  /^\s*>/, // citation par préfixe
  /a écrit\s*:\s*$/i, // « Le … a écrit : » (Gmail, Thunderbird, Outlook FR)
  /wrote:\s*$/i, // « On … wrote: » (Apple Mail, Gmail en anglais)
  /^\s*-{2,}\s*(Message d'origine|Original Message|Forwarded message)/i,
  /^\s*_{5,}\s*$/, // séparateur Outlook
  /répondez simplement « STOP »/i, // notre pied de page, cité sans préfixe
];

/** Le texte nouveau d'une réponse : tout ce qui précède la première citation. */
export function newContent(text: string): string {
  const kept: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (QUOTE_START.some((pattern) => pattern.test(line))) break;
    kept.push(line);
  }
  return kept.join("\n").split(OPT_OUT_FOOTER).join("").trim();
}

// « STOP » comme mot entier, dans le texte nouveau ou dans l'objet (le lien de désinscription du Hub envoie « STOP » en objet).
const STOP_WORD = /(^|[^\p{L}\p{N}_])stop([^\p{L}\p{N}_]|$)/iu;

/** Vrai si le prospect demande à ne plus être contacté. Le texte doit être celui de newContent. */
export function isStopRequest(freshText: string, subject: string) {
  return STOP_WORD.test(freshText) || STOP_WORD.test(subject);
}

const SVIX_TOLERANCE_SECONDS = 5 * 60;
const SVIX_SECRET_PREFIX = "whsec_";

/**
 * Signature Svix (utilisée par Resend). Le contenu signé est `id.timestamp.corps brut` ; la clé est la partie base64
 * du secret après « whsec_ » ; la signature est en base64, dans une liste « v1,<signature> » séparée par des espaces.
 * L'horodatage doit être à moins de cinq minutes de `now`.
 */
export function verifySvixSignature({
  id,
  timestamp,
  signature,
  body,
  secret,
  now = new Date(),
}: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  now?: Date;
}): boolean {
  if (!id || !timestamp || !signature || !secret.startsWith(SVIX_SECRET_PREFIX)) return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(now.getTime() / 1000 - seconds) > SVIX_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.slice(SVIX_SECRET_PREFIX.length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Événement « email.received » de Resend : les métadonnées seulement. Le corps s'obtient par l'API de réception.
const ResendReceivedEvent = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().min(1).max(100),
    from: z.string().min(3).max(320),
    to: z.array(z.string()).max(50).optional(),
    message_id: z.string().max(998).nullish(),
    subject: z.string().max(998).nullish(),
  }),
});

export type ResendReceived = {
  emailId: string;
  from: string;
  to: string[];
  messageId: string | null;
  subject: string | null;
  createdAt: string | null;
};

/** Événement reçu de Resend, ou null si ce n'est pas un email reçu (autre type, forme inattendue). */
export function parseResendEvent(payload: unknown): ResendReceived | null {
  const parsed = ResendReceivedEvent.safeParse(payload);
  if (!parsed.success || parsed.data.type !== "email.received") return null;
  const { data, created_at } = parsed.data;
  return {
    emailId: data.email_id,
    from: data.from,
    to: data.to ?? [],
    messageId: data.message_id ?? null,
    subject: data.subject ?? null,
    createdAt: created_at ?? null,
  };
}

// Corps d'un email reçu, tel que le renvoie GET https://api.resend.com/emails/receiving/{id}.
export const ResendReceivedBody = z.object({
  text: z.string().nullish(),
  html: z.string().nullish(),
  message_id: z.string().nullish(),
  subject: z.string().nullish(),
});

// Champs du format « parsed » de SendGrid Inbound Parse (multipart/form-data) : from, to, subject, text, html,
// headers (en-têtes bruts), envelope (JSON : { to: [...], from }).
export function parseSendgridEnvelopeTo(envelope: string): string[] {
  try {
    const parsed = z.object({ to: z.array(z.string()).max(50).optional() }).safeParse(JSON.parse(envelope));
    return parsed.success ? (parsed.data.to ?? []) : [];
  } catch {
    return [];
  }
}

/** Identifiant de message tiré des en-têtes bruts, pour ne pas enregistrer deux fois une réponse renvoyée. */
export function messageIdFromHeaders(headers: string): string | null {
  return /^message-id:\s*(<[^>\s]+>)/im.exec(headers)?.[1] ?? null;
}
