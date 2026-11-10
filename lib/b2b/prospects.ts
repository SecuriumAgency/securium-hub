import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { B2BProspect } from "./types";

// Source des demandes B2B. Elles contiennent des données personnelles de prospects : le dépôt est public, donc AUCUNE
// donnée ne figure dans le code. Deux sources, dans l'ordre :
//  1. la variable d'environnement B2B_PROSPECTS_JSON (tableau JSON), à définir dans l'hébergeur ;
//  2. le fichier local data/b2b-prospects.local.json, ignoré par Git.
// Sans l'une ni l'autre, la liste est vide. Lu côté serveur uniquement, par la route GET /api/b2b/prospects (session admin).

const LOCAL_FILE = join(process.cwd(), "data", "b2b-prospects.local.json");

const prospectSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  service: z.string().min(1).max(200),
  receivedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["À auditer", "En audit", "Audité"]),
});
const prospectsSchema = z.array(prospectSchema).max(500);

function readLocalFile(): string | null {
  try {
    return readFileSync(LOCAL_FILE, "utf8");
  } catch {
    return null;
  }
}

export function loadB2BProspects(): B2BProspect[] {
  const raw = process.env.B2B_PROSPECTS_JSON ?? readLocalFile();
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error("[b2b] source des demandes : JSON invalide, liste vide.");
    return [];
  }
  const parsed = prospectsSchema.safeParse(json);
  if (!parsed.success) {
    // Le détail des champs peut contenir des données personnelles : seul le nombre d'erreurs est journalisé.
    console.error(`[b2b] source des demandes : ${parsed.error.issues.length} erreur(s) de format, liste vide.`);
    return [];
  }
  return parsed.data;
}
