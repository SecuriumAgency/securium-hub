// Journal d'activité du poste (Securium-OS/logs/agent-activity.log), lu par la télémétrie du Hub. Les scripts du
// Hub qui tournent sur le poste y écrivent une ligne par passage, comme les agents de Securium-OS : le panneau
// « Escadron Agents » affiche alors la dernière action et l'erreur éventuelle.
// Format : une ligne JSON {agent, status, action}. Aucune adresse ni contenu d'email n'y est écrit : seulement
// des comptes et des statuts (les adresses trouvées dans un message d'erreur sont masquées).
import { appendFile, mkdir, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Même chemin que la télémétrie du poste (agent-dashboard/scripts/hub-telemetry.mts) : Securium-OS/logs.
const LOG_PATH = process.env.AGENT_LOG_PATH ?? path.join(HUB_ROOT, "..", "Securium-OS", "logs", "agent-activity.log");
const MAX_ACTION_LENGTH = 280;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

export type JournalStatus = "active" | "paused" | "error";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ajoute une ligne au journal. N'échoue jamais : un journal illisible ne doit pas faire échouer l'agent. */
export async function journaliser(agent: string, status: JournalStatus, action: string): Promise<void> {
  const texte = action.replace(EMAIL, "<adresse>").slice(0, MAX_ACTION_LENGTH);
  const ligne = `${JSON.stringify({ agent, status, action: texte })}\n`;
  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    // Même verrou que scripts/sync-remote.mts et scripts/lib/agent-log.sh : un répertoire `.lock`.
    const verrou = `${LOG_PATH}.lock`;
    let verrouille = false;
    for (let essai = 0; essai < 500 && !verrouille; essai++) {
      try {
        await mkdir(verrou);
        verrouille = true;
      } catch {
        await sleep(10);
      }
    }
    try {
      await appendFile(LOG_PATH, ligne, "utf8");
    } finally {
      if (verrouille) await rmdir(verrou).catch(() => {});
    }
  } catch (error) {
    console.error(`journal du poste impossible : ${(error as Error).message}`);
  }
}
