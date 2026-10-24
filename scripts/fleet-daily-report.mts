/*
 * Rapport quotidien de la flotte, envoyé par email chaque soir à 20h (PM2 : ecosystem.config.js,
 * application securium-fleet-report). Mise en page de l'ancien « Rapport digital quotidien »
 * (securium-agency-v2), données du Hub : statut Vercel et leads de chaque site, prospection et échanges.
 *
 *   npx tsx scripts/fleet-daily-report.mts            génère et envoie
 *   npx tsx scripts/fleet-daily-report.mts --dry-run  génère seulement : le HTML est écrit dans le dossier
 *                                                    temporaire, rien n'est envoyé
 *
 * FLEET_REPORT_DRY_RUN=1 équivaut à --dry-run (pm2 start ecosystem.config.js --only securium-fleet-report --env dryrun).
 * Destinataire : FLEET_REPORT_TO, sinon contact@securium-agency.fr. Envoi : lib/mail.ts (SMTP_*).
 * Variables lues dans .env.local puis .env du Hub : POSTGRES_PRISMA_URL, SMTP_*, VERCEL_API_TOKEN et
 * VERCEL_TEAM_ID (sans eux, statuts des sites inconnus).
 * Le rapport ne contient que des comptes : ni nom, ni téléphone, ni adresse de lead ou de prospect.
 * Lancé avec tsx : le client Prisma généré importe ses modules sans extension.
 */
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RECIPIENT = "contact@securium-agency.fr";
const TAG = "[FleetReport]";

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}
const dryRun = process.argv.includes("--dry-run") || process.env.FLEET_REPORT_DRY_RUN === "1";
const recipient = process.env.FLEET_REPORT_TO?.trim() || DEFAULT_RECIPIENT;

const { prisma } = await import("../lib/prisma.ts");
const { initialSites } = await import("../lib/sites.ts");
const { fetchDeploymentStatus } = await import("../lib/vercel.ts");
const { startOfDay, startOfMonth } = await import("../lib/month.ts");
const { contactedProspectsWhere, INBOUND, OUTBOUND } = await import("../lib/chasseur.ts");
const report = await import("../lib/fleet-report.ts");
const { sendEmail } = await import("../lib/mail.ts");

const now = new Date();
const dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

try {
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const leadsBySite = (createdAfter?: Date) =>
    prisma.lead
      .groupBy({ by: ["siteId"], _count: { _all: true }, where: createdAfter ? { createdAt: { gte: createdAfter } } : {} })
      .then((rows) => new Map(rows.map((row) => [row.siteId, row._count._all])));

  const token = process.env.VERCEL_API_TOKEN;
  const [today, month, total, statuses, prospects, contacted, drafts, sentToday, repliesToday] = await Promise.all([
    leadsBySite(dayStart),
    leadsBySite(monthStart),
    leadsBySite(),
    // Sites sans projet Vercel (le QG) : statut fixe de lib/sites.ts.
    Promise.all(initialSites.map((site) => (token && site.vercelProject ? fetchDeploymentStatus(site.vercelProject, token) : site.status))),
    prisma.outreachProspect.count(),
    prisma.outreachProspect.count({ where: contactedProspectsWhere() }),
    prisma.outreachDraft.count(),
    prisma.outreachMessage.count({ where: { direction: OUTBOUND, createdAt: { gte: dayStart } } }),
    prisma.outreachMessage.count({ where: { direction: INBOUND, createdAt: { gte: dayStart } } }),
  ]);

  const data = {
    dateLabel,
    vercelAvailable: Boolean(token),
    sites: initialSites.map((site, index) => ({
      name: site.name,
      status: statuses[index],
      leadsToday: today.get(site.id) ?? 0,
      leadsMonth: month.get(site.id) ?? 0,
      leadsTotal: total.get(site.id) ?? 0,
    })),
    outreach: { prospects, contacted, drafts, sentToday, repliesToday },
  };
  const html = report.buildFleetReportHtml(data);
  const text = report.buildFleetReportText(data);
  const totals = report.fleetTotals(data);
  const summary =
    `${totals.leadsToday} lead(s) aujourd'hui, ${totals.leadsMonth} ce mois, ${totals.online}/${totals.sites} sites en ligne, ` +
    `${totals.drafts} brouillon(s) à valider, ${totals.sentToday} envoi(s) et ${totals.repliesToday} réponse(s) aujourd'hui`;

  if (dryRun) {
    // Date de Paris (AAAA-MM-JJ) : celle de dayStart en UTC serait la veille au soir.
    const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const file = path.join(os.tmpdir(), `securium-fleet-report-${day}.html`);
    await writeFile(file, html, "utf8");
    console.log(`${TAG} Essai à blanc (${dateLabel}) : ${summary}.`);
    console.log(`${TAG} HTML écrit dans ${file} ; rien n'est envoyé (destinataire prévu : ${recipient}).`);
  } else {
    const { messageId } = await sendEmail({ to: recipient, subject: `Rapport quotidien de la flotte Securium — ${dateLabel}`, html, text });
    console.log(`${TAG} Rapport envoyé avec succès à ${recipient} (${summary}). Message-ID ${messageId}.`);
  }
} catch (error) {
  console.error(`${TAG} Échec du rapport : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
