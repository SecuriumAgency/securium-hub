import type Anthropic from "@anthropic-ai/sdk";
import * as chasseur from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";
import { isWorkingTime, OFFICE_HOURS } from "@/lib/schedule";

// Passage automatique de l'agent Chasseur, lancé par Vercel Cron (app/api/cron/chasseur).
// Même logique que scripts/agent-chasseur.mts, sans dépendre du poste : la liste noire est lue dans
// la base (OutreachBlocklist), et le brief dans AgentSettings. Rien n'est envoyé : chaque brouillon
// attend la validation humaine sur /admin/outreach.

const MAX_TOKENS = 16_000;

export type PassGuard = { run: true } | { run: false; reason: string };

/** Garde-fous d'un passage automatique : jamais le week-end, seulement de 9h à 18h à Paris. */
export function passGuard(now: Date): PassGuard {
  if (!isWorkingTime(now)) return { run: false, reason: "week-end" };
  if (!isWorkingTime(now, OFFICE_HOURS)) return { run: false, reason: `hors ${OFFICE_HOURS.start}h-${OFFICE_HOURS.end}h (Paris)` };
  return { run: true };
}

export type PassResult =
  | { status: "blocked"; reason: string }
  | {
      status: "ran";
      targets: number;
      batch: number;
      drafted: number;
      refused: number;
      rejected: number;
      gone: number;
      excluded: Record<string, number>;
    };

/**
 * Rédige au plus `limit` brouillons. Ne lit ni n'écrit rien si le brief est incomplet ou si la liste
 * noire est vide : un désinscrit ne doit jamais être ciblé faute de liste.
 */
export async function runChasseurPass({
  client,
  model,
  now,
  limit,
}: {
  client: Anthropic;
  model: string;
  now: Date;
  limit: number;
}): Promise<PassResult> {
  const brief = await prisma.agentSettings.findUnique({ where: { id: chasseur.AGENT_SETTINGS_ID } });
  const briefIssue = chasseur.briefError(brief);
  if (!brief || briefIssue) return { status: "blocked", reason: `brief incomplet (${briefIssue})` };

  const blocklist = new Set((await prisma.outreachBlocklist.findMany({ select: { email: true } })).map((row) => row.email));
  if (blocklist.size === 0) {
    return { status: "blocked", reason: "liste noire vide : lancez la synchronisation des prospects une fois" };
  }

  const prospects = await prisma.outreachProspect.findMany({
    include: {
      draft: { select: { id: true } },
      _count: { select: { messages: { where: { direction: chasseur.INBOUND } } } },
    },
    orderBy: { lastContactAt: "asc" },
  });
  const excluded: Record<string, number> = {};
  const targets = prospects.filter((prospect) => {
    const reason = chasseur.exclusionReason(
      { ...prospect, hasDraft: prospect.draft !== null, hasReplied: prospect._count.messages > 0 },
      blocklist,
      now,
    );
    if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;
    return reason === null;
  });
  const batch = targets.slice(0, limit);
  const system = chasseur.systemPrompt(brief);
  const outcome = { drafted: 0, refused: 0, rejected: 0, gone: 0 };

  for (const prospect of batch) {
    // Refus de Claude : repli côté serveur sur le modèle recommandé pour la catégorie.
    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: chasseur.DRAFT_SCHEMA } },
      messages: [{ role: "user", content: chasseur.prospectContext(prospect) }],
    });
    if (response.stop_reason === "refusal") {
      outcome.refused++;
      continue;
    }
    const text = response.content.find((block) => block.type === "text")?.text ?? "";
    let draft: { subject: string; body: string };
    try {
      draft = JSON.parse(text) as { subject: string; body: string };
    } catch {
      outcome.rejected++;
      continue;
    }
    if (chasseur.draftErrors(draft).length > 0) {
      outcome.rejected++;
      continue;
    }

    // Statut A_valider et brouillon ensemble : si le prospect a changé entre-temps, rien n'est écrit.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.outreachProspect.update({
          where: { id: prospect.id, status: prospect.status, draft: { is: null } },
          data: { status: chasseur.DRAFT_STATUS },
        });
        await tx.outreachDraft.create({
          data: {
            prospectId: prospect.id,
            subject: draft.subject.trim(),
            body: chasseur.withOptOut(draft.body),
            previousStatus: prospect.status,
            model: response.model,
          },
        });
      });
      outcome.drafted++;
    } catch {
      outcome.gone++;
    }
  }

  return { status: "ran", targets: targets.length, batch: batch.length, ...outcome, excluded };
}
