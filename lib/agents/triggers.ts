// Workflows GitHub Actions que le cockpit peut lancer. La liste est fixe : ni le dépôt ni le workflow ne
// viennent de la requête. Les trois workflows déclarent `workflow_dispatch` (voir AGENTS_REGISTRY.md).
export type WorkflowTrigger = { id: string; label: string; repo: string; workflow: string; ref: string };

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  {
    id: "geo-lighthouse",
    label: "Lighthouse CI · GeoEnergy Habitat",
    repo: "SecuriumAgency/geoenergyhabitat",
    workflow: "lighthouse.yml",
    ref: "main",
  },
  {
    id: "geo-indexation",
    label: "Indexation Google · GeoEnergy Habitat",
    repo: "SecuriumAgency/geoenergyhabitat",
    workflow: "seo-indexing.yml",
    ref: "main",
  },
  {
    id: "elite-lighthouse",
    label: "Lighthouse CI · Elite Dépannage",
    repo: "SecuriumAgency/Elite-Depannage",
    workflow: "lighthouse-ci.yml",
    ref: "master",
  },
];

export type TriggerResult = { ok: boolean; status: number; message: string };

const TIMEOUT_MS = 8000;

// Lance un workflow par l'API GitHub (POST …/dispatches). Le jeton GITHUB_ACTIONS_TOKEN reste côté serveur.
export async function triggerWorkflow(id: string): Promise<TriggerResult> {
  const target = WORKFLOW_TRIGGERS.find((item) => item.id === id);
  if (!target) return { ok: false, status: 404, message: "Agent inconnu." };

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    return { ok: false, status: 503, message: "Déclenchement non configuré : GITHUB_ACTIONS_TOKEN est absent." };
  }

  const url = `https://api.github.com/repos/${target.repo}/actions/workflows/${target.workflow}/dispatches`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: target.ref }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // GitHub répond 204 sans corps quand le workflow est planifié.
    if (response.status === 204) return { ok: true, status: 200, message: `${target.label} lancé sur ${target.ref}.` };
    return { ok: false, status: 502, message: `GitHub a répondu ${response.status}. Vérifiez le jeton et le workflow.` };
  } catch {
    return { ok: false, status: 502, message: "GitHub injoignable." };
  }
}
