// Agent Chasseur : rédige avec Claude des brouillons d'email de prospection pour les prospects
// d'OutreachProspect (scripts/agent-chasseur.mts). Rien ne part sans validation humaine sur
// /admin/outreach, qui seule pose le statut « Envoye ».
import { isExcludedStatus } from "./outreach";

// Brouillon rédigé, en attente de validation sur /admin/outreach.
export const DRAFT_STATUS = "A_valider";
// Posé à la validation, quand l'email part vraiment.
export const SENT_STATUS = "Envoye";
// Délai minimal depuis le dernier contact avant d'en rédiger un nouveau.
export const MIN_DAYS_SINCE_CONTACT = 7;

export const SENDER = "Securium Agency, agence web";

// Consigne de l'agent : la première phrase est celle de la mission, la suite borne ce qu'il peut affirmer.
// Le prospect n'est connu que par son entreprise, son domaine et son historique de contact : ce qui
// n'y figure pas ne doit pas apparaître dans l'email.
export const SYSTEM_PROMPT = `Tu es un assistant de prospection. Rédige un email court, ultra-personnalisé, sans ton commercial agressif, basé sur les données de l'entreprise cible.

Tu écris au nom de ${SENDER}, en français, en vouvoyant.
Appuie-toi uniquement sur les données fournies : n'invente ni fait sur l'entreprise, ni chiffre, ni échange passé, ni nom de personne. Si les données sont maigres, reste simple plutôt que de deviner.
Le prospect a déjà reçu un ou plusieurs emails restés sans réponse : ne fais pas comme si c'était un premier contact, et ne lui reproche pas son silence.
Corps de 60 à 150 mots, une seule question ou proposition concrète, sans liste à puces, sans formule de désinscription (elle est ajoutée ensuite).
Réponds avec un objet JSON { "subject": ..., "body": ... } : objet de moins de 80 caractères, corps en texte brut signé « L'équipe Securium Agency ».`;

// Schéma de la réponse de Claude (output_config.format).
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

// Opposition exigée en prospection B2B : ajoutée par le code, jamais laissée au modèle.
export const OPT_OUT_FOOTER =
  "—\nSi vous ne souhaitez plus recevoir de message de Securium Agency, répondez simplement « STOP » à cet email.";

// Messageries grand public : le domaine de l'adresse n'y dit rien de l'entreprise.
const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.fr", "live.com",
  "yahoo.com", "yahoo.fr", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "icloud.com",
  "me.com", "aol.com", "gmx.fr", "bbox.fr",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long" });

type ProspectFacts = { company: string; email: string; status: string; createdAt: Date; lastContactAt: Date };

// Ce qui part chez Claude : entreprise, domaine (s'il est propre à l'entreprise) et historique.
// Jamais l'adresse complète ni le téléphone, inutiles pour rédiger.
export function prospectContext(prospect: ProspectFacts) {
  const domain = prospect.email.split("@")[1] ?? "";
  const contacts = prospect.status === "Relance_1" ? "deux emails (un premier contact, puis une relance)" : "un email";
  return [
    `Entreprise : ${prospect.company}`,
    PUBLIC_MAIL_DOMAINS.has(domain) || !domain ? "Site : inconnu" : `Domaine : ${domain}`,
    `Historique : ${contacts}, du ${dateFormat.format(prospect.createdAt)} au ${dateFormat.format(prospect.lastContactAt)}, sans réponse.`,
  ].join("\n");
}

type Eligibility = { email: string; status: string; lastContactAt: Date; hasDraft: boolean };

// Raison pour laquelle un prospect ne peut pas être ciblé, ou null s'il peut l'être.
export function exclusionReason(prospect: Eligibility, blocklist: ReadonlySet<string>, now: Date) {
  if (blocklist.has(prospect.email)) return "blocklist";
  if (isExcludedStatus(prospect.status)) return "statut exclu";
  if (prospect.hasDraft || prospect.status === DRAFT_STATUS) return "brouillon en attente";
  if (now.getTime() - prospect.lastContactAt.getTime() < MIN_DAYS_SINCE_CONTACT * DAY_MS) return "contact récent";
  return null;
}

// Contrôle de la réponse de Claude avant enregistrement : vide, gabarit non rempli ou hors format.
export function draftErrors(draft: { subject: string; body: string }) {
  const errors: string[] = [];
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  if (subject.length < 3 || subject.length > 90) errors.push(`objet de ${subject.length} caractères (attendu : 3 à 90)`);
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 40 || words > 220) errors.push(`corps de ${words} mots (attendu : 40 à 220)`);
  if (/\[[^\]]*\]|\{\{|XXX|lorem ipsum/i.test(`${subject}\n${body}`)) errors.push("gabarit non rempli ([…], {{…}}, XXX)");
  if (/https?:\/\//i.test(body)) errors.push("lien dans le corps");
  return errors;
}

export function withOptOut(body: string) {
  return `${body.trim()}\n\n${OPT_OUT_FOOTER}`;
}
