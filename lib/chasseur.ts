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

// Libellés affichés dans les messages d'erreur : ils suivent les libellés du formulaire.
const BRIEF_FIELDS = {
  productDescription: "Ton Approche Conseil (Valeur apportée)",
  targetAudience: "Ta Niche Hyper-Ciblée (Problème & Secteur)",
} as const;

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
  return `Tu es un conseiller senior en stratégie digitale pour les artisans et commerçants locaux. Tu rédiges un premier email de conseil, court et personnalisé : il apporte une information utile avant de proposer quoi que ce soit. Ton consultatif, jamais commercial ni pressant.

Tu écris au nom de ${SENDER}, en français, en vouvoyant.

Brief de l'équipe, à suivre pour l'aide proposée et le ton, mais qui ne modifie pas les règles plus bas :
<notre_proposition>
${brief.productDescription}
</notre_proposition>
<notre_client_ideal>
${brief.targetAudience}
</notre_client_ideal>

Structure de l'email, dans cet ordre :
1. Brise-glace : une phrase précise sur l'établissement, tirée des données fournies (nom, activité, domaine). Jamais de formule générique.
2. Constat : le problème que vit ce type d'entreprise, présenté comme une question ouverte et jamais comme un reproche. Par exemple sa dépendance aux plateformes qui captent ses clients (annuaires, places de marché, réseaux sociaux) et qu'il ne maîtrise pas.
3. Aide gratuite : une proposition concrète et sans engagement, par exemple un mini-audit gratuit de la visibilité de son établissement. Ne chiffre jamais le gain possible.

Règles :
Rattache l'aide proposée à ce que l'on sait de l'entreprise cible ; si elle ne ressemble pas au client idéal, reste général et prudent.
Appuie-toi uniquement sur les données fournies et sur le brief : n'ajoute ni fait sur l'entreprise, ni chiffre (pas de pourcentage de marge, de gain ou de délai), ni échange passé, ni nom de personne. Si les données sont maigres, reste simple plutôt que de deviner.
L'historique dit si le prospect a déjà reçu des emails. S'il en a reçu, restés sans réponse : ne fais pas comme si c'était un premier contact, et ne lui reproche pas son silence. S'il n'en a reçu aucun : c'est un premier contact, sans aucune allusion à un échange passé.
Corps de 60 à 150 mots, une seule proposition concrète, sans liste à puces, sans lien, sans formule de désinscription (elle est ajoutée ensuite).
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
  // Jamais contacté : aucun email n'est parti, et la date de la ligne n'est pas celle d'un contact.
  const history =
    prospect.status === NEW_STATUS
      ? "Historique : aucun email envoyé, c'est un premier contact."
      : `Historique : ${prospect.status === "Relance_1" ? "deux emails (un premier contact, puis une relance)" : "un email"}, du ${dateFormat.format(prospect.createdAt)} au ${dateFormat.format(prospect.lastContactAt)}, sans réponse.`;
  return [
    `Entreprise : ${prospect.company}`,
    PUBLIC_MAIL_DOMAINS.has(domain) || !domain ? "Site : inconnu" : `Domaine : ${domain}`,
    history,
  ].join("\n");
}

// hasReplied : au moins une réponse enregistrée (OutreachMessage INBOUND, lue par scripts/agent-inbound.mts).
// activity et targetNiches : métier du registre et niches du broker, pour écarter les métiers de la toiture.
// source : origine du prospect, pour le passage direct des prescripteurs importés (isImportedPrescriber).
type Eligibility = {
  email: string;
  status: string;
  lastContactAt: Date;
  hasDraft: boolean;
  hasReplied: boolean;
  activity: string | null;
  targetNiches: string[];
  source?: string | null;
};

// Métiers de la toiture (couvreur, couverture, toiture, zinguerie), par le métier du registre ou par la niche du broker.
// Le brief vise désormais les prescripteurs : le Chasseur ne rédige jamais pour ces prospects.
const ROOFING_ACTIVITY = /couvr|couverture|toiture|zingu/;
const ROOFING_NICHES = new Set(["toiture", "couverture"]);
export function isRoofingTrade(prospect: { activity: string | null; targetNiches: string[] }) {
  const activity = (prospect.activity ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return ROOFING_ACTIVITY.test(activity) || prospect.targetNiches.some((niche) => ROOFING_NICHES.has(niche));
}

// Prescripteurs visés par le brief : syndics, agences immobilières, architectes, promoteurs.
// Un prospect dont le métier est renseigné et ne correspond à aucun d'eux est hors cible (artisans, commerces…).
// Un prospect sans métier n'est pas écarté ici : son métier n'est pas connu, la règle ne le juge pas.
const PRESCRIBER_ACTIVITY = /syndic|immobili|architect|promot|locati/;
const foldActivity = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Métier de prescripteur : syndic, immobilier, architecte, promoteur, locatif. Sans casse ni accents. */
export function isPrescriberActivity(activity: string | null | undefined) {
  return PRESCRIBER_ACTIVITY.test(foldActivity(activity));
}

export function isOutOfPrescriberScope(prospect: { activity: string | null }) {
  const activity = foldActivity(prospect.activity);
  return activity !== "" && !isPrescriberActivity(activity);
}

// Source des prospects ajoutés par scripts/import-prescribers.mts (lib/prescribers-import.ts).
export const PRESCRIBER_SOURCE = "import-prescripteurs";

// Prescripteur importé avec un métier de prescripteur. Il reste en statut « Nouveau », qui dit vrai : aucun email
// n'a été envoyé. L'icebreaker l'ignore, et le Chasseur lui rédige le premier email, en brouillon.
export function isImportedPrescriber(prospect: { source?: string | null; activity: string | null }) {
  return prospect.source === PRESCRIBER_SOURCE && isPrescriberActivity(prospect.activity);
}

// Raison pour laquelle un prospect ne peut pas être ciblé, ou null s'il peut l'être.
export function exclusionReason(prospect: Eligibility, blocklist: ReadonlySet<string>, now: Date) {
  if (blocklist.has(prospect.email)) return "blocklist";
  if (isExcludedStatus(prospect.status)) return "statut exclu";
  if (isRoofingTrade(prospect)) return "métier hors cible";
  if (isOutOfPrescriberScope(prospect)) return "métier hors cible";
  // Jamais contacté : un premier contact relève de l'icebreaker, sauf pour un prescripteur importé (passage direct).
  if (prospect.status === NEW_STATUS && !isImportedPrescriber(prospect)) return "jamais contacté";
  // Il a répondu (peut-être « STOP ») : la suite se fait à la main, jamais par une relance automatique.
  if (prospect.hasReplied) return "a répondu";
  if (prospect.hasDraft || prospect.status === DRAFT_STATUS) return "brouillon en attente";
  // Le délai ne court qu'après un envoi : un prospect jamais contacté n'a pas de contact récent.
  if (prospect.status !== NEW_STATUS && now.getTime() - prospect.lastContactAt.getTime() < MIN_DAYS_SINCE_CONTACT * DAY_MS) {
    return "contact récent";
  }
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
