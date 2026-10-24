/*
 * Agent Chasseur : rédige avec Claude un brouillon d'email pour chaque prospect d'OutreachProspect
 * qui peut être relancé, et le laisse en attente de validation sur /admin/outreach (statut A_valider).
 * Il n'envoie rien : seule la validation humaine pose « Envoye ».
 *
 *   npx tsx scripts/agent-chasseur.mts               rédige au plus 5 brouillons
 *   npx tsx scripts/agent-chasseur.mts --limit=10    au plus 10
 *   npx tsx scripts/agent-chasseur.mts --dry-run     compte les prospects ciblables, sans Claude ni écriture
 *
 * Calendrier : jamais le samedi ni le dimanche, et seulement de 9h00 à 18h00 sauf --any-hour. Double
 * verrou du week-end, avant tout le reste : horloge de la machine d'abord (aucune heure simulée), puis
 * heure de Paris (isWorkingTime). Hors créneau, ni la base ni Claude ne sont touchés.
 * --now=<date ISO> simule une autre heure, en essai à blanc seulement, et jamais un samedi ou un dimanche réel.
 *
 * Brief : « Ce que tu vends » et « Ton client idéal » (table AgentSettings, saisis sur /admin/outreach),
 * relus à chaque passage et injectés dans la consigne de Claude. Sans brief complet, l'agent s'arrête.
 *
 * Exclus : adresses de blocklist.json (relue à chaque passage ; illisible, l'agent s'arrête), statuts
 * Desinscrit et Simulation, brouillon déjà en attente, dernier contact de moins de 7 jours.
 * Envoyé à Claude : entreprise, domaine et historique de contact, jamais l'adresse ni le téléphone.
 * Options : --data=<dossier de blocklist.json>, par défaut celui de securium-prospector.
 * Variables (.env.local puis .env du Hub) : POSTGRES_PRISMA_URL, ANTHROPIC_API_KEY (ou un profil
 * `ant auth login`), ANTHROPIC_MODEL (par défaut claude-opus-5-5).
 *
 * Lancé avec tsx et non Node seul : le client Prisma généré importe ses modules sans extension.
 */
import { isWorkingTime, OFFICE_HOURS } from "../lib/schedule.ts";

// Verrou strict, avant tout le reste : samedi et dimanche selon l'horloge de la machine (Paris sur le
// poste Securium), sans heure simulée possible. isWorkingTime() refait le contrôle à l'heure de Paris
// juste après : les deux doivent laisser passer.
if (new Date().getDay() === 0 || new Date().getDay() === 6) {
  console.log("Agent en pause stricte (Week-end).");
  process.exit(0);
}

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = process.argv.includes("--dry-run");
// Heure simulée : jamais pour un vrai passage, qui doit respecter le calendrier réel.
const simulated = option("now");
if (simulated && !dryRun) {
  console.error("Arrêt : --now n'est accepté qu'avec --dry-run.");
  process.exit(1);
}
const now = simulated ? new Date(simulated) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`Arrêt : --now invalide (${simulated}).`);
  process.exit(1);
}

// Kill switch, avant toute connexion : le week-end, l'agent ne fait rien.
if (!isWorkingTime(now)) {
  console.log("Agent en pause (Week-end)");
  process.exit(0);
}
if (!process.argv.includes("--any-hour") && !isWorkingTime(now, OFFICE_HOURS)) {
  console.log(`Agent en pause (hors ${OFFICE_HOURS.start}h00-${OFFICE_HOURS.end}h00, heure de Paris)`);
  process.exit(0);
}

const { readFileSync } = await import("node:fs");
const path = (await import("node:path")).default;
const { fileURLToPath } = await import("node:url");

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA = "C:/Users/Utilisateur/Documents/CV/securium-prospector/data";
const DEFAULT_LIMIT = 5;
const MAX_TOKENS = 16_000;

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

const { parseBlocklist } = await import("../lib/outreach.ts");
const chasseur = await import("../lib/chasseur.ts");
const { prisma } = await import("../lib/prisma.ts");

const limit = Number(option("limit") ?? DEFAULT_LIMIT);
if (!Number.isInteger(limit) || limit < 1) fail(`--limit invalide (${option("limit")}).`);

// RGPD : la blocklist fait foi, même pour un prospect que la dernière synchronisation n'a pas encore purgé.
const blocklistFile = path.join(option("data") ?? DEFAULT_DATA, "blocklist.json");
let blocklistData: unknown;
try {
  blocklistData = JSON.parse(readFileSync(blocklistFile, "utf8"));
} catch (error) {
  fail(`blocklist illisible (${blocklistFile}) : ${(error as Error).message}. Sans elle, un désinscrit pourrait être ciblé.`);
}
const blocklist = new Set(parseBlocklist(blocklistData) ?? fail(`blocklist de forme inconnue (${blocklistFile}).`));

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

  const prospects = await prisma.outreachProspect.findMany({
    include: { draft: { select: { id: true } } },
    orderBy: { lastContactAt: "asc" },
  });
  const excluded: Record<string, number> = {};
  const targets = prospects.filter((prospect) => {
    const reason = chasseur.exclusionReason({ ...prospect, hasDraft: prospect.draft !== null }, blocklist, now);
    if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;
    return reason === null;
  });

  console.log(`Prospects en base : ${prospects.length} ; ciblables : ${targets.length}`);
  for (const [reason, count] of Object.entries(excluded)) console.log(`  écartés (${reason}) : ${count}`);
  const batch = targets.slice(0, limit);
  console.log(`Brouillons à rédiger ce passage : ${batch.length} (plafond ${limit}), du contact le plus ancien au plus récent`);

  if (dryRun) {
    console.log("Essai à blanc : ni Claude ni écriture.");
  } else if (batch.length > 0 && brief) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
    const system = chasseur.systemPrompt(brief);
    const outcome = { drafted: 0, refused: 0, rejected: 0, gone: 0 };

    for (const prospect of batch) {
      const label = `${prospect.id} (${prospect.company})`;
      // Refus de Claude : repli côté serveur sur le modèle qu'Anthropic recommande pour la catégorie.
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
        console.log(`  ${label} : refusé par Claude (${response.stop_details?.category ?? "sans catégorie"}), ignoré`);
        continue;
      }
      const text = response.content.find((block) => block.type === "text")?.text ?? "";
      let draft: { subject: string; body: string };
      try {
        draft = JSON.parse(text) as { subject: string; body: string };
      } catch {
        outcome.rejected++;
        console.log(`  ${label} : réponse illisible (stop_reason ${response.stop_reason}), ignoré`);
        continue;
      }
      const errors = chasseur.draftErrors(draft);
      if (errors.length > 0) {
        outcome.rejected++;
        console.log(`  ${label} : brouillon écarté (${errors.join(", ")})`);
        continue;
      }

      // Statut A_valider et brouillon ensemble. Le prospect a pu être purgé ou recevoir un brouillon
      // depuis la lecture : la transaction échoue alors et rien n'est écrit.
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
        console.log(`  ${label} : brouillon enregistré (${response.model})`);
      } catch (error) {
        outcome.gone++;
        console.log(`  ${label} : prospect modifié ou purgé entre-temps, rien n'est écrit (${(error as Error).message.split("\n")[0]})`);
      }
    }
    console.log(
      `Passage terminé : ${outcome.drafted} brouillon(s) à valider sur /admin/outreach, ${outcome.refused} refus, ` +
        `${outcome.rejected} écarté(s), ${outcome.gone} prospect(s) modifié(s) entre-temps.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
