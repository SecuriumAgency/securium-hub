/*
 * Import sécurisé des prescripteurs B2B (syndics, agences immobilières, architectes, promoteurs) dans le registre.
 *
 *   npx tsx scripts/import-prescribers.mts               essai à blanc (par défaut) : valide, n'écrit rien
 *   npx tsx scripts/import-prescribers.mts --rehearse    exécute l'écriture puis l'annule : répétition générale
 *   npx tsx scripts/import-prescribers.mts --apply       écrit en base, en une seule transaction
 *
 * Fichier : data/prescripteurs-input.csv par défaut, ou --file=<chemin>. Séparateur « ; » ou « , ».
 * Colonnes obligatoires : company, email, metier. Facultatives : phone, city, address.
 * L'adresse n'a pas de champ dans le registre : elle est ignorée et le script le signale.
 * Un nouveau prescripteur reste en statut Nouveau (jamais contacté) : il ne passe pas par l'icebreaker, et le Chasseur
 * lui rédige le premier email, en brouillon à valider sur /admin/outreach. Rien n'est envoyé sans cette validation.
 * Les e-mails ne sont jamais affichés dans les logs.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planImport, parseCsv, type Plan } from "../lib/prescribers-import.ts";
import { normalizeEmail } from "../lib/outreach.ts";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");
const rehearse = process.argv.includes("--rehearse");

function fail(message: string): never {
  console.error(`Arrêt : ${message}`);
  process.exit(1);
}

if (apply && rehearse) fail("--apply et --rehearse ne s'utilisent pas ensemble.");
const mode = apply ? "apply" : rehearse ? "rehearse" : "dry-run";

// lib/prisma.ts lit POSTGRES_PRISMA_URL à son chargement : l'environnement d'abord.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(HUB_ROOT, file));
  } catch {
    // Fichier absent : on passe au suivant.
  }
}
const { prisma } = await import("../lib/prisma.ts");

const file = path.resolve(option("file") ?? path.join(HUB_ROOT, "data", "prescripteurs-input.csv"));
if (!existsSync(file)) fail(`fichier absent : ${file}. Déposez la liste avec les colonnes company, email, phone, city, metier, address.`);
const { headers, rows } = parseCsv(readFileSync(file, "utf8"));
for (const required of ["company", "email", "metier"]) {
  if (!headers.includes(required)) fail(`colonne obligatoire absente : ${required}`);
}

// Annulation volontaire de la répétition : rien ne doit être conservé.
class Rehearsal extends Error {
  created: number;
  completed: number;
  constructor(created: number, completed: number) {
    super("répétition annulée");
    this.created = created;
    this.completed = completed;
  }
}

function report(plan: Plan) {
  console.log(`Fichier : ${file}`);
  console.log(`Lignes lues : ${rows.length}`);
  for (const rejection of plan.rejections) {
    console.log(`  AVERT ligne ${rejection.line} — ${rejection.label} : ${rejection.reason}`);
  }
  console.log(`Valides, à créer en statut Nouveau : ${plan.creates.length}`);
  for (const creation of plan.creates) console.log(`  + ${creation.company} (${creation.activity})`);
  console.log(`Déjà en base, champs vides à compléter : ${plan.completions.length}`);
  for (const completion of plan.completions) console.log(`  ~ ${completion.company} : ${Object.keys(completion.data).join(", ")}`);
  console.log(`Déjà en base, rien à compléter : ${plan.unchanged}`);
  console.log(`Rejetées : ${plan.rejections.length}`);
  if (plan.addressIgnored) console.log("AVERT : la colonne address n'a pas de champ dans le registre : adresses ignorées.");
}

try {
  const blocklist = new Set((await prisma.outreachBlocklist.findMany({ select: { email: true } })).map((row) => row.email));
  const emails = rows.map((row) => normalizeEmail(row.email ?? "")).filter(Boolean);
  const found = emails.length
    ? await prisma.outreachProspect.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, status: true, company: true, phone: true, city: true, activity: true },
      })
    : [];
  const existing = new Map(found.map((prospect) => [prospect.email, prospect]));

  const plan = planImport(rows, headers, { blocklist, existing, now: new Date() });
  report(plan);

  if (mode === "dry-run") {
    console.log("Essai à blanc : rien n'est écrit. --rehearse pour répéter l'écriture, --apply pour écrire.");
  } else {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const created = plan.creates.length
          ? (await tx.outreachProspect.createMany({ data: plan.creates.map((creation) => creation.data), skipDuplicates: true })).count
          : 0;
        let completed = 0;
        for (const completion of plan.completions) {
          await tx.outreachProspect.update({ where: { id: completion.id }, data: completion.data });
          completed++;
        }
        if (mode === "rehearse") throw new Rehearsal(created, completed);
        return { created, completed };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`Écrit : ${outcome.created} créé(s), ${outcome.completed} complété(s), en une seule transaction.`);
  }
} catch (error) {
  if (error instanceof Rehearsal) {
    console.log(`Répétition : ${error.created} créé(s) et ${error.completed} complété(s) auraient été écrits. Annulé : aucune écriture conservée.`);
  } else {
    console.error("ERREUR : transaction annulée, rien n'est écrit :", error instanceof Error ? error.message : "erreur inconnue");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
