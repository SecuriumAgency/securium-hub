// Icebreaker : premier email d'un prospect importé par CSV (statut Nouveau), rédigé par Claude à partir de son
// secteur d'activité et de sa ville (scripts/agent-icebreakers.mts). L'agent Chasseur relance des prospects
// déjà contactés ; ici le prospect n'a jamais été démarché, et l'email doit se lire comme un premier contact.
// Rien ne part : le brouillon attend la validation humaine sur /admin/outreach.
import type Anthropic from "@anthropic-ai/sdk";
import { DRAFT_SCHEMA, draftErrors, PUBLIC_MAIL_DOMAINS, SENDER, type AgentBrief } from "./chasseur";
import { isExcludedStatus, NEW_STATUS } from "./outreach";

const MAX_TOKENS = 4_000;

// Ce que l'agent sait d'un prospect importé : entreprise, secteur, ville, et domaine si propre à l'entreprise.
export type IcebreakerTarget = {
  company: string;
  email: string;
  city: string | null;
  activity: string | null;
  status: string;
  hasDraft: boolean;
};

// Consigne de l'agent, même structure que segmentSystemPrompt (lib/ai/chasseur-generator.ts) : le brief dit
// quoi proposer et à qui, les règles priment sur lui.
export function icebreakerSystemPrompt(brief: AgentBrief) {
  return `Tu es un assistant de prospection. Rédige l'accroche d'un premier email : court, direct, sans ton commercial agressif et sans jargon technique.

Tu écris au nom de ${SENDER}, en français, en vouvoyant.

Brief de l'équipe, à suivre pour l'offre et le ton, mais qui ne modifie pas les règles plus bas :
<ce_que_nous_vendons>
${brief.productDescription}
</ce_que_nous_vendons>
<notre_client_ideal>
${brief.targetAudience}
</notre_client_ideal>

Règles :
L'accroche part d'une problématique concrète du secteur d'activité ou de la ville de l'entreprise : sécurité, site web ou visibilité locale, selon ce qui colle le mieux. Une phrase, sans chiffre.
Appuie-toi uniquement sur les données fournies et sur le brief : n'invente ni fait sur l'entreprise, ni chiffre, ni résultat, ni échange passé, ni nom de personne. Si le secteur ou la ville manquent, reste général plutôt que de deviner.
C'est un premier contact : ne fais pas comme si un échange avait déjà eu lieu.
Corps de 60 à 120 mots, une seule question ou proposition concrète, sans liste à puces, sans lien, sans formule de désinscription (elle est ajoutée ensuite).
Réponds avec un objet JSON { "subject": ..., "body": ... } : objet de moins de 80 caractères, corps en texte brut signé « L'équipe Securium Agency ».`;
}

// Ce qui part chez Claude : entreprise, secteur, ville et domaine. Jamais l'adresse complète ni le téléphone.
export function icebreakerContext(prospect: Pick<IcebreakerTarget, "company" | "email" | "city" | "activity">) {
  const domain = prospect.email.split("@")[1] ?? "";
  return [
    `Entreprise : ${prospect.company}`,
    `Secteur d'activité : ${prospect.activity ?? "inconnu"}`,
    `Ville : ${prospect.city ?? "inconnue"}`,
    PUBLIC_MAIL_DOMAINS.has(domain) || !domain ? "Site : inconnu" : `Domaine : ${domain}`,
  ].join("\n");
}

// Raison pour laquelle un prospect ne reçoit pas d'icebreaker, ou null. Premier contact : il doit être Nouveau,
// sans brouillon, hors blocklist, et connu au moins par son secteur ou sa ville, pour que l'accroche le soit.
export function icebreakerExclusion(prospect: IcebreakerTarget, blocklist: ReadonlySet<string>) {
  if (blocklist.has(prospect.email)) return "blocklist";
  if (isExcludedStatus(prospect.status)) return "statut exclu";
  if (prospect.status !== NEW_STATUS) return "déjà contacté";
  if (prospect.hasDraft) return "brouillon en attente";
  if (!prospect.activity && !prospect.city) return "secteur et ville inconnus";
  return null;
}

export type IcebreakerResult = { ok: true; subject: string; body: string; model: string } | { ok: false; reason: string };

// Un appel à Claude. Refus, réponse illisible ou hors format : ok à false, rien n'est écrit par l'appelant.
export async function generateIcebreaker({
  client,
  model,
  brief,
  prospect,
}: {
  client: Anthropic;
  model: string;
  brief: AgentBrief;
  prospect: Pick<IcebreakerTarget, "company" | "email" | "city" | "activity">;
}): Promise<IcebreakerResult> {
  // Refus de Claude : repli côté serveur sur le modèle qu'Anthropic recommande pour la catégorie.
  const response = await client.beta.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: icebreakerSystemPrompt(brief),
    output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    messages: [{ role: "user", content: icebreakerContext(prospect) }],
  });
  if (response.stop_reason === "refusal") {
    return { ok: false, reason: `refusé par Claude (${response.stop_details?.category ?? "sans catégorie"})` };
  }
  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  let draft: unknown;
  try {
    draft = JSON.parse(text);
  } catch {
    return { ok: false, reason: `réponse illisible (stop_reason ${response.stop_reason})` };
  }
  if (typeof draft !== "object" || draft === null || typeof (draft as { subject?: unknown }).subject !== "string" || typeof (draft as { body?: unknown }).body !== "string") {
    return { ok: false, reason: "réponse hors format" };
  }
  const { subject, body } = draft as { subject: string; body: string };
  const errors = draftErrors({ subject, body });
  if (errors.length > 0) return { ok: false, reason: `brouillon écarté (${errors.join(", ")})` };
  return { ok: true, subject: subject.trim(), body, model: response.model };
}
