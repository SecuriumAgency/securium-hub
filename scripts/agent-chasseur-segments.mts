/*
 * Agent Chasseur, accroches par segment : pour chaque segment de Securium-OS/data/leads/b2b-prospects.csv
 * (écrit par le Lead Prospector) pas encore traité, Claude rédige un email modèle, enregistré dans
 * ProspectionDraft au statut brouillon_en_attente et lu par GET /api/prospection/brouillons. Le CSV n'a ni
 * entreprise ni adresse : rien n'est envoyé, l'équipe adapte l'accroche à une entreprise du segment.
 *
 *   npx tsx scripts/agent-chasseur-segments.mts               rédige au plus 5 accroches
 *   npx tsx scripts/agent-chasseur-segments.mts --limit=10    au plus 10
 *   npx tsx scripts/agent-chasseur-segments.mts --dry-run     compte les segments à rédiger, sans Claude ni écriture
 *
 * Options : --csv=<fichier>, par défaut ../Securium-OS/data/leads/b2b-prospects.csv depuis la racine du Hub.
 * Exclus : lignes au statut « Envoyé » ou « Brouillon » (colonne statut facultative), doublons du CSV (même
 * segment, secteur et zone), segments qui ont déjà une accroche en base.
 * Brief (AgentSettings) et variables : comme scripts/agent-chasseur.mts. Sans brief complet, l'agent s'arrête.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CSV = path.resolve(HUB_ROOT, "..", "Securium-OS", "data", "leads", "b2b-prospects.csv");
const DEFAULT_LIMIT = 5;

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

const limit = Number(option("limit") ?? DEFAULT_LIMIT);
if (!Number.isInteger(limit) || limit < 1) fail(`--limit invalide (${option("limit")}).`);

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}

const chasseur = await import("../lib/chasseur.ts");
const generator = await import("../lib/ai/chasseur-generator.ts");
const { readProspectSegments } = await import("../lib/prospects-parser.ts");
const { prisma } = await import("../lib/prisma.ts");

const csvFile = option("csv") ?? DEFAULT_CSV;
let parsed: ReturnType<typeof readProspectSegments>;
try {
  parsed = readProspectSegments(csvFile);
} catch (error) {
  fail(`segments illisibles (${csvFile}) : ${(error as Error).message}`);
}
if (!parsed.ok) fail(`segments de forme inconnue (${csvFile}) : ${parsed.errors.join(", ")}.`);
console.log(`Segments : ${csvFile} ; ${parsed.segments.length} lu(s)`);
for (const reason of parsed.skipped) console.log(`  écarté (${reason})`);

try {
  // Brief saisi sur /admin/outreach : sans lui, l'agent ne sait ni quoi proposer ni à qui.
  const brief = await prisma.agentSettings.findUnique({ where: { id: chasseur.AGENT_SETTINGS_ID } });
  const briefIssue = chasseur.briefError(brief);
  if (!brief || briefIssue) {
    const message = `Agent non briefé (${briefIssue}) : renseignez « Ce que tu vends » et « Ton client idéal » dans Configuration de l'Agent, sur /admin/outreach.`;
    if (!dryRun) fail(message);
    console.log(message);
  } else {
    console.log(`Brief du ${brief.updatedAt.toISOString()} : chargé.`);
  }

  const { pending, targets } = await generator.segmentsToDraft(prisma, parsed.segments);
  console.log(
    `Segments non contactés : ${pending.length} ; sans accroche en base : ${targets.length} ; ` +
      `écartés (Envoyé, Brouillon ou doublon) : ${parsed.segments.length - pending.length}`,
  );
  const batch = targets.slice(0, limit);
  console.log(`Accroches à rédiger ce passage : ${batch.length} (plafond ${limit}), dans l'ordre du fichier`);

  if (dryRun) {
    console.log("Essai à blanc : ni Claude ni écriture.");
  } else if (batch.length > 0 && brief) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const outcome = await generator.draftSegments({
      prisma,
      client: new Anthropic(),
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
      brief,
      segments: batch,
      log: console.log,
    });
    console.log(
      `Passage terminé : ${outcome.drafted} accroche(s) en attente sur /admin/outreach, ${outcome.refused} refus, ` +
        `${outcome.rejected} écartée(s), ${outcome.conflicts} écriture(s) impossible(s).`,
    );
  }
} finally {
  await prisma.$disconnect();
}
