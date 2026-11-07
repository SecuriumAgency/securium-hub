import nodemailer, { type Transporter } from "nodemailer";
import { isOutreachAddress, normalizeEmail, OUTREACH_DOMAIN } from "./outreach";

// Envoi SMTP. Deux expéditeurs :
// - SMTP_FROM : rapport quotidien de la flotte (scripts/fleet-daily-report.mts) ;
// - OUTREACH_FROM : toute la prospection (validation à la main, envoi automatique), sur le sous-domaine dédié
//   OUTREACH_DOMAIN. Sans OUTREACH_FROM valide, rien ne part : jamais de repli sur le domaine principal.
// Variables : SMTP_HOST, SMTP_PORT (465 : TLS direct ; autre : STARTTLS exigé), SMTP_USER, SMTP_PASS, SMTP_FROM,
// OUTREACH_FROM (« Securium Agency <hello@outreach.securium-agency.fr> » ou l'adresse seule).

const SMTP_VARIABLES = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

// Configuration absente ou invalide : rien n'a été tenté auprès du serveur.
export class MailConfigError extends Error {}

function smtpConfig() {
  // Espaces retirés partout : `echo … | vercel env add` laisse un retour à la ligne final dans la valeur.
  const env = Object.fromEntries(SMTP_VARIABLES.map((name) => [name, process.env[name]?.trim() ?? ""])) as Record<
    (typeof SMTP_VARIABLES)[number],
    string
  >;
  const missing = SMTP_VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) throw new MailConfigError(`SMTP non configuré : ${missing.join(", ")} manquant(s).`);
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new MailConfigError(`SMTP_PORT invalide : ${env.SMTP_PORT}.`);
  return {
    transport: {
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // Un serveur muet ne doit pas bloquer la validation ni la transaction qui l'attend.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    },
    from: env.SMTP_FROM,
  };
}

let cached: { transporter: Transporter; from: string } | null = null;

function mailer() {
  if (!cached) {
    const { transport, from } = smtpConfig();
    cached = { transporter: nodemailer.createTransport(transport), from };
  }
  return cached;
}

/**
 * Expéditeur de la prospection : OUTREACH_FROM, qui doit être une adresse du sous-domaine dédié. Lève MailConfigError
 * si la variable manque ou pointe ailleurs : l'envoi est refusé plutôt que de partir du domaine principal.
 */
export function outreachSender(value: string | undefined = process.env.OUTREACH_FROM) {
  const from = value?.trim() ?? "";
  if (!from) throw new MailConfigError("OUTREACH_FROM manquant : la prospection ne part pas du domaine principal.");
  if (!isOutreachAddress(from)) throw new MailConfigError(`OUTREACH_FROM doit être une adresse de ${OUTREACH_DOMAIN}.`);
  return { from, address: normalizeEmail(from) };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Texte brut en HTML : caractères spéciaux échappés d'abord (le texte vient de Claude, il ne doit
// injecter aucune balise), puis retours à la ligne en <br>.
export function textToHtml(text: string) {
  const escaped = text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  return `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5;">${escaped.replace(/\r?\n/g, "<br>")}</div>`;
}

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  from?: string;
  replyTo?: string;
};

// Envoie un email (expéditeur SMTP_FROM par défaut). Lève une erreur si le serveur refuse l'envoi ou le
// destinataire : l'appelant ne doit alors rien enregistrer.
export async function sendEmail({ to, subject, html, text, headers, from, replyTo }: Email) {
  const { transporter, from: defaultFrom } = mailer();
  const info = await transporter.sendMail({ from: from ?? defaultFrom, replyTo, to, subject, text, html, headers });
  const rejected = info.rejected ?? [];
  if (rejected.length > 0) throw new Error(`Destinataire refusé par le serveur SMTP : ${rejected.join(", ")}.`);
  return { messageId: info.messageId };
}

// Email de prospection : expéditeur et réponses sur le sous-domaine dédié (Reply-To), corps en texte brut converti
// en HTML, et désinscription en un clic côté messagerie, en plus de la mention « STOP » du corps.
export async function sendOutreachEmail({ to, subject, body }: { to: string; subject: string; body: string }) {
  const sender = outreachSender();
  return sendEmail({
    to,
    subject,
    text: body,
    html: textToHtml(body),
    from: sender.from,
    replyTo: sender.address,
    headers: { "List-Unsubscribe": `<mailto:${sender.address}?subject=STOP>` },
  });
}

// Diagnostic : connexion et authentification auprès du serveur, sans rien envoyer.
export async function verifyMailTransport() {
  await mailer().transporter.verify();
}
