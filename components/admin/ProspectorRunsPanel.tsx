import { fetchProspectorRuns, type ProspectorRun } from "@/lib/prospector-runs";

// Heure de Paris imposée, comme le reste de la prospection.
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "short",
});

const neutralStyle = "border-border bg-muted text-foreground";

function badgeOf(run: ProspectorRun): { label: string; style: string } {
  if (run.status !== "completed") {
    return { label: "En cours", style: "border-warning/30 bg-warning/10 text-warning" };
  }
  if (run.conclusion === "success") {
    return { label: "Réussi", style: "border-success/30 bg-success/10 text-success" };
  }
  if (run.conclusion === "failure") {
    return { label: "Échec", style: "border-destructive/30 bg-destructive/10 text-destructive" };
  }
  return { label: run.conclusion ?? "Inconnu", style: neutralStyle };
}

const eventLabel: Record<string, string> = {
  schedule: "planifié",
  workflow_dispatch: "lancé à la main",
};

// Panneau des runs quotidiens du Prospector : le dernier run en échec est signalé en tête de liste.
export async function ProspectorRunsPanel() {
  const result = await fetchProspectorRuns();

  return (
    <section aria-labelledby="prospector-runs-title" className="flex flex-col gap-4">
      <h2 id="prospector-runs-title" className="text-lg font-semibold text-foreground md:text-xl">
        Prospector · runs quotidiens
      </h2>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-6">
        {result.state === "unconfigured" && (
          <p className="text-sm text-muted-foreground">
            Statut non disponible : la variable <span className="break-words font-mono text-foreground">PROSPECTOR_GITHUB_TOKEN</span>{" "}
            n&apos;est pas configurée sur Vercel.
          </p>
        )}

        {result.state === "error" && <p className="text-sm text-destructive">{result.message}</p>}

        {result.state === "ok" && result.runs.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun run enregistré pour le moment.</p>
        )}

        {result.state === "ok" && result.runs.length > 0 && (
          <>
            {result.runs[0].status === "completed" && result.runs[0].conclusion === "failure" && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Le dernier run a échoué. Ouvrez-le pour lire le motif : les leads restent dans la boîte d&apos;envoi et partiront au run suivant.
              </p>
            )}

            <ul className="flex flex-col divide-y divide-border">
              {result.runs.map((run) => {
                const badge = badgeOf(run);
                return (
                  <li key={run.id} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${badge.style}`}>{badge.label}</span>
                      <span className="text-sm font-medium text-foreground">Run #{run.number}</span>
                      <span className="text-xs text-muted-foreground">{eventLabel[run.event] ?? run.event}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">{dateFormat.format(run.createdAt)}</span>
                      <a
                        href={run.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center text-foreground transition-colors hover:text-primary"
                      >
                        Voir les logs
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs text-muted-foreground">
              Ce statut indique si le run a réussi, pas combien de leads sont partis vers l&apos;agence : ce détail est dans les logs.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
