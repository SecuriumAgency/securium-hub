import nodemailer, { type Transporter } from "nodemailer";

// Envoi SMTP des emails de prospection validés sur /admin/outreach (PATCH /api/outreach/drafts/[id]),
// depuis SMTP_FROM. Variables : SMTP_HOST, SMTP_PORT (465 : TLS direct ; autre : STARTTLS exigé),
// SMTP_USER, SMTP_PASS, SMTP_FROM (« Securium Agency <contact@securium-agency.fr> » ou l'adresse seule).

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
  // Adresse seule, pour l'en-tête List-Unsubscribe.
  const fromAddress = /<([^<>\s]+@[^<>\s]+)>/.exec(env.SMTP_FROM)?.[1] ?? env.SMTP_FROM;
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
    fromAddress,
  };
}

let cached: { transporter: Transporter; from: string; fromAddress: string } | null = null;

function mailer() {
  if (!cached) {
    const { transport, from, fromAddress } = smtpConfig();
    cached = { transporter: nodemailer.createTransport(transport), from, fromAddress };
  }
  return cached;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Texte brut en HTML : caractères spéciaux échappés d'abord (le texte vient de Claude, il ne doit
// injecter aucune balise), puis retours à la ligne en <br>.
export function textToHtml(text: string) {
  const escaped = text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  return `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5;">${escaped.replace(/\r?\n/g, "<br>")}</div>`;
}

// Envoie l'email (version HTML et texte de repli). Lève une erreur si le serveur refuse l'envoi ou le
// destinataire : l'appelant ne doit alors rien enregistrer.
export async function sendOutreachEmail({ to, subject, body }: { to: string; subject: string; body: string }) {
  const { transporter, from, fromAddress } = mailer();
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: textToHtml(body),
    // Désinscription en un clic côté messagerie, en plus de la mention « STOP » du corps.
    headers: { "List-Unsubscribe": `<mailto:${fromAddress}?subject=STOP>` },
  });
  const rejected = info.rejected ?? [];
  if (rejected.length > 0) throw new Error(`Destinataire refusé par le serveur SMTP : ${rejected.join(", ")}.`);
  return { messageId: info.messageId };
}

// Diagnostic : connexion et authentification auprès du serveur, sans rien envoyer.
export async function verifyMailTransport() {
  await mailer().transporter.verify();
}
