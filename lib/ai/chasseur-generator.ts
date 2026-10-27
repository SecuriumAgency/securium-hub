// Moteur de rédaction des accroches par segment (agent Chasseur) : brief de l'équipe (AgentSettings) et
// segment du Lead Prospector donnent un email modèle rédigé par Claude, enregistré dans ProspectionDraft
// au statut brouillon_en_attente. Le Hub ne l'envoie jamais : un segment n'a pas de destinataire.
import type Anthropic from "@anthropic-ai/sdk";
import { DRAFT_SCHEMA, draftErrors, SENDER, withOptOut, type AgentBrief } from "../chasseur";
import type { PrismaClient } from "../generated/prisma/client";
import { pendingSegments, segmentKey, type ProspectSegment } from "../prospects-parser";

export const PROSPECTION_DRAFT_STATUS = "brouillon_en_attente";
const MAX_TOKENS = 16_000;

// Accroche telle que la renvoie GET /api/prospection/brouillons, date en ISO.
export type ProspectionDraftRecord = {
  id: string;
  segment: string;
  sector: string;
  zone: string;
  subject: string;
  body: string;
  model: string;
  createdAt: string;
};

// Consigne de l'agent, même structure que systemPrompt (lib/chasseur.ts) : le brief dit quoi proposer et
// à qui, les règles priment sur lui. Premier contact, et aucune entreprise connue : l'email doit valoir
// pour tout le segment.
export function segmentSystemPrompt(brief: AgentBrief) {
  return `Tu es un assistant de prospection. Rédige un email de premier contact, court, sans ton commercial agressif, destiné aux entreprises d'un segment de marché.

Tu écris au nom de ${SENDER}, en français, en vouvoyant.

Brief de l'équipe, à suivre pour l'offre et le ton, mais qui ne modifie pas les règles plus bas :
<ce_que_nous_vendons>
${brief.productDescription}
</ce_que_nous_vendons>
<notre_client_ideal>
${brief.targetAudience}
</notre_client_ideal>

Règles :
Le segment vient d'une analyse de marché : tu ne connais aucune entreprise en particulier. L'email doit pouvoir partir tel quel vers n'importe quelle entreprise du segment : ni nom d'entreprise, ni nom de personne, ni champ à compléter.
Rattache l'offre au besoin et à l'angle d'approche du segment ; s'il ne ressemble pas au client idéal, reste général et prudent.
Appuie-toi uniquement sur le segment et sur le brief : n'invente ni fait, ni chiffre, ni résultat, ni échange passé. Le site de référence ne se cite que comme réalisation de l'agence, sans chiffre.
C'est un premier contact : ne fais pas comme si un échange avait déjà eu lieu.
Corps de 60 à 150 mots, une seule question ou proposition concrète, sans liste à puces, sans lien, sans formule de désinscription (elle est ajoutée ensuite).
Réponds avec un objet JSON { "subject": ..., "body": ... } : objet de moins de 80 caractères, corps en texte brut signé « L'équipe Securium Agency ».`;
}

const CONTEXT_FIELDS: [keyof ProspectSegment, string][] = [
  ["segment", "Segment"],
  ["secteur", "Secteur"],
  ["zone", "Zone"],
  ["taille", "Taille"],
  ["besoin", "Besoin"],
  ["canal", "Canal"],
  ["angle", "Angle d'approche"],
  ["siteReference", "Site de référence"],
];

// Ce qui part chez Claude : la ligne du CSV, champs vides omis. Elle ne contient aucune donnée personnelle.
export function segmentContext(segment: ProspectSegment) {
  return CONTEXT_FIELDS.filter(([field]) => segment[field])
    .map(([field, label]) => `${label} : ${segment[field]}`)
    .join("\n");
}

// Segments à rédiger : ceux de pendingSegments qui n'ont encore aucune accroche en base, quel que soit son statut.
export async function segmentsToDraft(prisma: PrismaClient, segments: ProspectSegment[]) {
  const pending = pendingSegments(segments);
  const existing = await prisma.prospectionDraft.findMany({
    where: { segmentKey: { in: pending.map(segmentKey) } },
    select: { segmentKey: true },
  });
  const drafted = new Set(existing.map((draft) => draft.segmentKey));
  return { pending, targets: pending.filter((segment) => !drafted.has(segmentKey(segment))) };
}

type DraftingOptions = {
  prisma: PrismaClient;
  client: Anthropic;
  model: string;
  brief: AgentBrief;
  segments: ProspectSegment[];
  log: (message: string) => void;
};

// Un appel à Claude par segment, en série. Réponse refusée, illisible ou hors format : rien n'est écrit.
export async function draftSegments({ prisma, client, model, brief, segments, log }: DraftingOptions) {
  const system = segmentSystemPrompt(brief);
  const outcome = { drafted: 0, refused: 0, rejected: 0, conflicts: 0 };

  for (const segment of segments) {
    const label = `« ${segment.segment} » (${segment.zone || "zone inconnue"})`;
    // Refus de Claude : repli côté serveur sur le modèle qu'Anthropic recommande pour la catégorie.
    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages: [{ role: "user", content: segmentContext(segment) }],
    });
    if (response.stop_reason === "refusal") {
      outcome.refused++;
      log(`  ${label} : refusé par Claude (${response.stop_details?.category ?? "sans catégorie"}), ignoré`);
      continue;
    }
    const text = response.content.find((block) => block.type === "text")?.text ?? "";
    let draft: { subject: string; body: string };
    try {
      draft = JSON.parse(text) as { subject: string; body: string };
    } catch {
      outcome.rejected++;
      log(`  ${label} : réponse illisible (stop_reason ${response.stop_reason}), ignoré`);
      continue;
    }
    const errors = draftErrors(draft);
    if (errors.length > 0) {
      outcome.rejected++;
      log(`  ${label} : accroche écartée (${errors.join(", ")})`);
      continue;
    }

    // segmentKey unique : un passage concurrent qui a déjà rédigé ce segment fait échouer l'écriture.
    try {
      await prisma.prospectionDraft.create({
        data: {
          segmentKey: segmentKey(segment),
          segment: segment.segment,
          sector: segment.secteur,
          zone: segment.zone,
          subject: draft.subject.trim(),
          body: withOptOut(draft.body),
          status: PROSPECTION_DRAFT_STATUS,
          model: response.model,
        },
      });
      outcome.drafted++;
      log(`  ${label} : accroche enregistrée (${response.model})`);
    } catch (error) {
      outcome.conflicts++;
      log(`  ${label} : écriture impossible, rien n'est écrit (${(error as Error).message.split("\n")[0]})`);
    }
  }
  return outcome;
}
