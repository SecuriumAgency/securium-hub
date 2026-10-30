/*
 * Agent icebreaker : rédige avec Claude l'accroche du premier email de chaque prospect importé par CSV
 * (statut Nouveau, jamais contacté), à partir de son secteur d'activité et de sa ville. Le brouillon attend
 * sur /admin/outreach, colonne « Icebreaker Généré » : il n'envoie rien, seule la validation humaine envoie.
 *
 *   npx tsx scripts/agent-icebreakers.mts               rédige au plus 5 brouillons
 *   npx tsx scripts/agent-icebreakers.mts --limit=10    au plus 10
 *   npx tsx scripts/agent-icebreakers.mts --dry-run     compte les prospects ciblables, sans Claude ni écriture
 *
 * Calendrier : du lundi au vendredi, de 9h00 à 18h00 à Paris, comme l'agent Chasseur. --any-hour lève la
 * plage horaire, pas le week-end.
 *
 * Brief : « Ce que tu vends » et « Ton client idéal » (table AgentSettings, saisis sur /admin/outreach),
 * obligatoires hors --dry-run.
 *
 * Exclus : adresses de blocklist.json (relue à chaque passage ; illisible, l'agent s'arrête), statuts
 * Desinscrit et Simulation, prospects déjà contactés ou déjà au brouillon, prospects sans secteur ni ville.
 * Envoyé à Claude : entreprise, secteur, ville et domaine, jamais l'adresse complète ni le téléphone.
 * Options : --data=<dossier de blocklist.json>, par défaut celui de securium-prospector.
 * Variables (.env.local puis .env du Hub) : POSTGRES_PRISMA_URL, ANTHROPIC_API_KEY (ou un profil
 * `ant auth login`), ANTHROPIC_MODEL (par défaut claude-opus-5-5).
 *
 * Lancé avec tsx et non Node seul : le client Prisma généré importe ses modules sans extension.
 */
import { isWorkingTime, OFFICE_HOURS } from "../lib/schedule.ts";

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = process.argv.includes("--dry-run");
const now = new Date();

// Week-end toujours fermé ; les heures de bureau tombent sauf --any-hour.
if (!isWorkingTime(now)) {
  console.log("Agent en pause (week-end).");
  process.exit(0);
}
if (!process.argv.includes("--any-hour") && !isWorkingTime(now, OFFICE_HOURS)) {
  console.log(`Agent en pause (hors ${OFFICE_HOURS.start}h00-${OFFICE_HOURS.end}h00, heure de Paris).`);
  process.exit(0);
}

const { readFileSync } = await import("node:fs");
const path = (await import("node:path")).default;
const { fileURLToPath } = await import("node:url");

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA = "C:/Users/Utilisateur/Documents/CV/securium-prospector/data";
const DEFAULT_LIMIT = 5;

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}

const limit = Number(option("limit") ?? DEFAULT_LIMIT);
if (!Number.isInteger(limit) || limit < 1) fail(`--limit invalide (${option("limit")}).`);

const { parseBlocklist, NEW_STATUS } = await import("../lib/outreach.ts");
const chasseur = await import("../lib/chasseur.ts");
const icebreaker = await import("../lib/outreach-ai.ts");
const { PipelineStatus } = await import("../lib/generated/prisma/enums.ts");
const { prisma } = await import("../lib/prisma.ts");

// RGPD : la blocklist fait foi. Sans elle, un désinscrit pourrait recevoir un brouillon.
const blocklistFile = path.join(option("data") ?? DEFAULT_DATA, "blocklist.json");
let blocklistData: unknown;
try {
  blocklistData = JSON.parse(readFileSync(blocklistFile, "utf8"));
} catch (error) {
  fail(`blocklist illisible (${blocklistFile}) : ${(error as Error).message}. Sans elle, un désinscrit pourrait être ciblé.`);
}
const blocklist = new Set(parseBlocklist(blocklistData) ?? fail(`blocklist de forme inconnue (${blocklistFile}).`));

try {
  // Brief saisi sur /admin/outreach : sans lui, l'accroche ne sait ni quoi proposer ni à qui.
  const brief = await prisma.agentSettings.findUnique({ where: { id: chasseur.AGENT_SETTINGS_ID } });
  const briefIssue = chasseur.briefError(brief);
  if (!dryRun && (!brief || briefIssue)) {
    fail(`agent non briefé (${briefIssue}) : renseignez « Ce que tu vends » et « Ton client idéal » dans Configuration de l'Agent, sur /admin/outreach.`);
  }

  const prospects = await prisma.outreachProspect.findMany({
    where: { status: NEW_STATUS },
    include: { draft: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  const excluded: Record<string, number> = {};
  const targets = prospects.filter((prospect) => {
    const reason = icebreaker.icebreakerExclusion({ ...prospect, hasDraft: prospect.draft !== null }, blocklist);
    if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;
    return reason === null;
  });

  console.log(`Prospects Nouveau en base : ${prospects.length} ; ciblables : ${targets.length}`);
  for (const [reason, count] of Object.entries(excluded)) console.log(`  écartés (${reason}) : ${count}`);
  const batch = targets.slice(0, limit);
  console.log(`Icebreakers à rédiger ce passage : ${batch.length} (plafond ${limit}), du plus ancien au plus récent`);

  if (dryRun) {
    console.log("Essai à blanc : ni Claude ni écriture.");
  } else if (batch.length > 0 && brief) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
    const outcome = { drafted: 0, rejected: 0, gone: 0 };

    for (const prospect of batch) {
      const label = `${prospect.id} (${prospect.company})`;
      const result = await icebreaker.generateIcebreaker({ client, model, brief, prospect });
      if (!result.ok) {
        outcome.rejected++;
        console.log(`  ${label} : ${result.reason}, ignoré`);
        continue;
      }
      // Statut A_valider, colonne « Icebreaker Généré » et brouillon ensemble. Le prospect a pu changer depuis
      // la lecture : la transaction échoue alors, et rien n'est écrit.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.outreachProspect.update({
            where: { id: prospect.id, status: NEW_STATUS, draft: { is: null } },
            data: { status: chasseur.DRAFT_STATUS, pipelineStatus: PipelineStatus.ICEBREAKER_GENERE },
          });
          await tx.outreachDraft.create({
            data: {
              prospectId: prospect.id,
              subject: result.subject,
              body: chasseur.withOptOut(result.body),
              previousStatus: NEW_STATUS,
              model: result.model,
            },
          });
        });
        outcome.drafted++;
        console.log(`  ${label} : icebreaker enregistré (${result.model})`);
      } catch (error) {
        outcome.gone++;
        console.log(`  ${label} : prospect modifié entre-temps, rien n'est écrit (${(error as Error).message.split("\n")[0]})`);
      }
    }
    console.log(
      `Passage terminé : ${outcome.drafted} icebreaker(s) à valider sur /admin/outreach, ${outcome.rejected} écarté(s) ou refusé(s), ` +
        `${outcome.gone} prospect(s) modifié(s) entre-temps.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
