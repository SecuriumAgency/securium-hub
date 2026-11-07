import { DRAFT_STATUS, INBOUND, OPT_OUT_FOOTER, draftErrors, isPrescriberActivity, isRoofingTrade } from "./chasseur";
import { MailConfigError } from "./mail";
import { RecordError, SendError, sendDraft } from "./outreach-send";
import { isExcludedStatus } from "./outreach";
import { prisma } from "./prisma";
import { OFFICE_HOURS, isWorkingTime } from "./schedule";

// Envoi automatique des brouillons de prescripteurs rédigés par le Chasseur, sans validation humaine.
// Lancé par Vercel Cron (app/api/cron/auto-sender) ou à la main (scripts/auto-sender.mts). Le même envoi que la
// validation sur /admin/outreach (lib/outreach-send.ts), mais après des contrôles faits au moment de l'envoi :
// une réponse arrivée entre-temps, un désinscrit ou une adresse en blocklist bloquent le brouillon.
// Un brouillon bloqué n'est pas supprimé : il reste à traiter à la main sur /admin/outreach.

export const AUTO_SEND_LIMIT = 10;
const PAUSE_BETWEEN_SENDS_MS = 3_000;

export type SendCandidate = {
  id: string;
  subject: string;
  body: string;
  prospect: {
    company: string;
    email: string;
    status: string;
    isClient: boolean;
    activity: string | null;
    targetNiches: string[];
    hasReplied: boolean;
  };
};

/** Raison pour laquelle un brouillon ne part pas tout seul, ou null. Ne lit ni n'écrit rien. */
export function autoSendBlockReason(candidate: SendCandidate, blocklist: ReadonlySet<string>): string | null {
  const prospect = candidate.prospect;
  if (blocklist.has(prospect.email)) return "blocklist";
  if (isExcludedStatus(prospect.status)) return "statut exclu";
  if (prospect.status !== DRAFT_STATUS) return "statut inattendu";
  if (prospect.isClient) return "client";
  // Il a répondu (peut-être « STOP ») : la suite se fait à la main, jamais par un envoi automatique.
  if (prospect.hasReplied) return "a répondu";
  if (isRoofingTrade({ activity: prospect.activity, targetNiches: prospect.targetNiches })) return "métier hors cible";
  if (!isPrescriberActivity(prospect.activity)) return "hors prescripteurs";
  // La mention de désinscription doit être dans le corps : sans elle, rien ne part automatiquement.
  if (!candidate.body.includes(OPT_OUT_FOOTER)) return "sans mention de désinscription";
  if (draftErrors({ subject: candidate.subject, body: candidate.body }).length > 0) return "brouillon invalide";
  return null;
}

export type AutoSendResult =
  | { status: "skipped"; reason: string }
  | {
      status: "ran";
      dryRun: boolean;
      eligible: number;
      sent: number;
      failed: number;
      blocked: Record<string, number>;
      stopped: "smtp" | "enregistrement" | null;
      // Essai à blanc seulement : entreprises qui partiraient, sans adresse.
      wouldSend?: string[];
    };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envoie au plus `limit` brouillons éligibles. Essai à blanc : rien n'est envoyé, et la plage horaire ne s'applique pas.
 * Un échec SMTP arrête le passage (rien n'est parti pour ce brouillon). Un échec d'enregistrement arrête aussi :
 * l'email est parti, le brouillon est retiré pour qu'il ne reparte pas au passage suivant.
 */
export async function runAutoSender({
  now = new Date(),
  limit = AUTO_SEND_LIMIT,
  dryRun,
  pauseMs = PAUSE_BETWEEN_SENDS_MS,
}: {
  now?: Date;
  limit?: number;
  dryRun: boolean;
  pauseMs?: number;
}): Promise<AutoSendResult> {
  if (!dryRun && !isWorkingTime(now, OFFICE_HOURS)) {
    return { status: "skipped", reason: "hors plage d'envoi (lundi au vendredi, 9h00 à 18h00, heure de Paris)" };
  }

  const blocklist = new Set((await prisma.outreachBlocklist.findMany({ select: { email: true } })).map((row) => row.email));
  const drafts = await prisma.outreachDraft.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subject: true,
      body: true,
      prospect: {
        select: {
          company: true,
          email: true,
          status: true,
          isClient: true,
          activity: true,
          targetNiches: true,
          _count: { select: { messages: { where: { direction: INBOUND } } } },
        },
      },
    },
  });

  const blocked: Record<string, number> = {};
  const eligible: SendCandidate[] = [];
  for (const draft of drafts) {
    const candidate: SendCandidate = {
      id: draft.id,
      subject: draft.subject,
      body: draft.body,
      prospect: { ...draft.prospect, hasReplied: draft.prospect._count.messages > 0 },
    };
    const reason = autoSendBlockReason(candidate, blocklist);
    if (reason) blocked[reason] = (blocked[reason] ?? 0) + 1;
    else eligible.push(candidate);
  }

  if (dryRun) {
    return {
      status: "ran",
      dryRun: true,
      eligible: eligible.length,
      sent: 0,
      failed: 0,
      blocked,
      stopped: null,
      wouldSend: eligible.slice(0, limit).map((candidate) => candidate.prospect.company),
    };
  }

  const result: AutoSendResult = { status: "ran", dryRun: false, eligible: eligible.length, sent: 0, failed: 0, blocked, stopped: null };
  for (const candidate of eligible.slice(0, limit)) {
    try {
      const outcome = await sendDraft(candidate.id);
      if (outcome.status === "sent") result.sent++;
      else blocked["brouillon disparu"] = (blocked["brouillon disparu"] ?? 0) + 1;
    } catch (error) {
      if (error instanceof SendError) {
        // Le message SMTP peut contenir une adresse : seule la cause de configuration est détaillée.
        const detail = error.cause instanceof MailConfigError ? error.message : "envoi refusé ou interrompu";
        console.error(`[auto-sender] envoi impossible, passage arrêté : ${detail}`);
        result.failed++;
        result.stopped = "smtp";
        break;
      }
      if (error instanceof RecordError) {
        // Ne pas laisser le brouillon : il repartirait au passage suivant. Le retrait est un effort, pas une garantie.
        await prisma.outreachDraft.deleteMany({ where: { id: candidate.id } }).catch(() => undefined);
        console.error(
          `[auto-sender] email envoyé (Message-ID ${error.messageId ?? "inconnu"}) mais non enregistré : brouillon ${candidate.id} retiré, à vérifier dans la boîte d'envoi.`,
        );
        result.failed++;
        result.stopped = "enregistrement";
        break;
      }
      throw error;
    }
    if (pauseMs > 0) await pause(pauseMs);
  }
  return result;
}
