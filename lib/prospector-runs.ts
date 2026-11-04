// Runs du Prospector (dépôt securium-prospector), lus sur GitHub Actions. Lecture seule : le token
// PROSPECTOR_GITHUB_TOKEN n'a besoin que de l'accès « Actions : lecture » sur ce dépôt, et il ne quitte
// jamais le serveur. Ce statut dit si un run a réussi ou échoué, pas combien de leads sont partis :
// ce détail reste dans les logs du run.

const REPO = "SecuriumAgency/securium-prospector";
const WORKFLOW_FILE = "prospector.yml";
const RUNS_SHOWN = 5;
// Le statut des runs change au plus une fois par jour : une mise en cache de cinq minutes suffit.
const CACHE_SECONDS = 300;

export type ProspectorRun = {
  id: number;
  number: number;
  /** queued, in_progress ou completed. */
  status: string;
  /** success, failure, cancelled… ; null tant que le run n'est pas terminé. */
  conclusion: string | null;
  createdAt: Date;
  url: string;
  /** schedule (planifié) ou workflow_dispatch (lancé à la main). */
  event: string;
};

export type ProspectorRunsState =
  | { state: "unconfigured" }
  | { state: "error"; message: string }
  | { state: "ok"; runs: ProspectorRun[] };

type GithubRun = {
  id: number;
  run_number: number;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  event: string;
};

function isGithubRun(value: unknown): value is GithubRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.id === "number" &&
    typeof run.run_number === "number" &&
    typeof run.created_at === "string" &&
    typeof run.html_url === "string"
  );
}

export async function fetchProspectorRuns(): Promise<ProspectorRunsState> {
  const token = process.env.PROSPECTOR_GITHUB_TOKEN;
  if (!token) return { state: "unconfigured" };

  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${RUNS_SHOWN}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: CACHE_SECONDS },
      },
    );
  } catch {
    return { state: "error", message: "GitHub est injoignable pour le moment." };
  }

  if (!response.ok) {
    return {
      state: "error",
      message: `GitHub a répondu HTTP ${response.status}. Vérifiez le token et son accès au dépôt.`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "error", message: "Réponse GitHub illisible." };
  }

  const list =
    typeof body === "object" && body !== null && Array.isArray((body as { workflow_runs?: unknown }).workflow_runs)
      ? ((body as { workflow_runs: unknown[] }).workflow_runs)
      : [];

  const runs: ProspectorRun[] = list.filter(isGithubRun).map((run) => ({
    id: run.id,
    number: run.run_number,
    status: run.status ?? "unknown",
    conclusion: run.conclusion,
    createdAt: new Date(run.created_at),
    url: run.html_url,
    event: run.event,
  }));

  return { state: "ok", runs };
}
