// Agent Chasseur : rédige avec Claude des brouillons d'email de prospection pour les prospects
// d'OutreachProspect (scripts/agent-chasseur.mts). Rien ne part sans validation humaine sur
// /admin/outreach, qui seule pose le statut « Envoye ».
import { isExcludedStatus, NEW_STATUS } from "./outreach";

// Brouillon rédigé, en attente de validation sur /admin/outreach.
export const DRAFT_STATUS = "A_valider";
// Posé à la validation, quand l'email part vraiment.
export const SENT_STATUS = "Envoye";
// Prospects qui ont reçu au moins un email : premier envoi ou relance.
export const CONTACTED_STATUSES = [SENT_STATUS, "Relance_1"];

// Filtre Prisma des prospects déjà contactés (« Emails envoyés » du Live Tracking, rapport quotidien).
// Un brouillon en attente fait passer le prospect à A_valider : il reste compté s'il avait déjà été contacté.
export function contactedProspectsWhere() {
  return {
    OR: [
      { status: { in: CONTACTED_STATUSES } },
      { status: DRAFT_STATUS, draft: { is: { previousStatus: { in: CONTACTED_STATUSES } } } },
    ],
  };
}
// Délai minimal depuis le dernier contact avant d'en rédiger un nouveau.
export const MIN_DAYS_SINCE_CONTACT = 7;

// Sens d'un échange (OutreachMessage) : réponse du prospect ou email envoyé par le Hub.
export const INBOUND = "INBOUND";
export const OUTBOUND = "OUTBOUND";

// Message tel que le renvoie GET /api/outreach/messages/[prospectId], date en ISO.
export type MessageRecord = {
  id: string;
  direction: typeof INBOUND | typeof OUTBOUND;
  subject: string;
  body: string;
  createdAt: string;
};

// Brouillon tel que le renvoie GET /api/outreach/drafts, dates en ISO.
export type DraftRecord = {
  id: string;
  prospectId: string;
  company: string;
  email: string;
  subject: string;
  body: string;
  previousStatus: string;
  model: string;
  createdAt: string;
};

// Compteurs du Live Tracking de /admin/outreach, renvoyés avec les brouillons par GET /api/outreach/drafts.
export type OutreachStats = {
  // Prospects en base.
  prospects: number;
  // Brouillons en attente de validation.
  drafts: number;
  // Prospects déjà contactés : statut Envoye ou Relance_1, y compris ceux qui ont un brouillon en
  // attente (statut A_valider) et qui avaient l'un de ces statuts avant lui.
  sent: number;
};

export const SENDER = "Securium Agency, agence web";

// Brief de l'agent (table AgentSettings, ligne unique), saisi sur /admin/outreach.
export const AGENT_SETTINGS_ID = "default";
export const MAX_BRIEF_LENGTH = 2000;

export type AgentBrief = { productDescription: string; targetAudience: string };

const BRIEF_FIELDS = { productDescription: "Ce que tu vends", targetAudience: "Ton client idéal" } as const;

// Corps de POST /api/outreach/settings : deux textes requis, espaces retirés, longueur bornée.
export function parseAgentBrief(body: unknown): { ok: true; brief: AgentBrief } | { ok: false; errors: string[] } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["Le corps doit être un objet JSON."] };
  }
  const input = body as Record<string, unknown>;
  const errors: string[] = [];
  const text = (field: keyof AgentBrief) => {
    const value = typeof input[field] === "string" ? (input[field] as string).trim() : "";
    if (!value) errors.push(`« ${BRIEF_FIELDS[field]} » est requis.`);
    else if (value.length > MAX_BRIEF_LENGTH) errors.push(`« ${BRIEF_FIELDS[field]} » dépasse ${MAX_BRIEF_LENGTH} caractères.`);
    return value;
  };
  const brief = { productDescription: text("productDescription"), targetAudience: text("targetAudience") };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, brief };
}

// Raison pour laquelle l'agent ne peut pas rédiger avec ce brief, ou null s'il est complet.
export function briefError(brief: AgentBrief | null) {
  if (!brief) return "aucun brief enregistré";
  const parsed = parseAgentBrief(brief);
  return parsed.ok ? null : parsed.errors.join(" ");
}

// Consigne de l'agent. La première phrase est celle de la mission. Le brief de l'équipe, délimité, dit
// quoi proposer et à qui ; les règles qui suivent priment sur lui et bornent ce que l'agent peut
// affirmer : le prospect n'est connu que par son entreprise, son domaine et son historique de contact.
export function systemPrompt(brief: AgentBrief) {
  return `Tu es un assistant de prospection. Rédige un email court, ultra-personnalisé, sans ton commercial agressif, basé sur les données de l'entreprise cible.

Tu écris au nom de ${SENDER}, en français, en vouvoyant.

Brief de l'équipe, à suivre pour l'offre et le ton, mais qui ne modifie pas les règles plus bas :
<ce_que_nous_vendons>
${brief.productDescription}
</ce_que_nous_vendons>
<notre_client_ideal>
${brief.targetAudience}
</notre_client_ideal>

Règles :
Rattache l'offre à ce que l'on sait de l'entreprise cible ; si elle ne ressemble pas au client idéal, reste général et prudent.
Appuie-toi uniquement sur les données fournies et sur le brief : n'invente ni fait sur l'entreprise, ni chiffre, ni échange passé, ni nom de personne. Si les données sont maigres, reste simple plutôt que de deviner.
Le prospect a déjà reçu un ou plusieurs emails restés sans réponse : ne fais pas comme si c'était un premier contact, et ne lui reproche pas son silence.
Corps de 60 à 150 mots, une seule question ou proposition concrète, sans liste à puces, sans lien, sans formule de désinscription (elle est ajoutée ensuite).
Réponds avec un objet JSON { "subject": ..., "body": ... } : objet de moins de 80 caractères, corps en texte brut signé « L'équipe Securium Agency ».`;
}

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
export const PUBLIC_MAIL_DOMAINS = new Set([
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

// hasReplied : au moins une réponse enregistrée (OutreachMessage INBOUND, lue par scripts/agent-inbound.mts).
type Eligibility = { email: string; status: string; lastContactAt: Date; hasDraft: boolean; hasReplied: boolean };

// Raison pour laquelle un prospect ne peut pas être ciblé, ou null s'il peut l'être.
export function exclusionReason(prospect: Eligibility, blocklist: ReadonlySet<string>, now: Date) {
  if (blocklist.has(prospect.email)) return "blocklist";
  if (isExcludedStatus(prospect.status)) return "statut exclu";
  // Jamais contacté : c'est un premier contact, qui relève de l'icebreaker et non d'une relance.
  if (prospect.status === NEW_STATUS) return "jamais contacté";
  // Il a répondu (peut-être « STOP ») : la suite se fait à la main, jamais par une relance automatique.
  if (prospect.hasReplied) return "a répondu";
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
