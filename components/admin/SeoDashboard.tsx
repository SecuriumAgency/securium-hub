import type { AgentReport, SeoAudit } from "@/lib/seo/checks";

type SiteOption = { id: string; name: string };

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const select =
  "min-h-[44px] rounded-lg border border-border bg-muted px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary";
const submit =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

// Seuils de lecture du score : au-dessus de 80, le site est sain ; entre 50 et 80, à corriger ; en dessous, urgent.
const scoreTone = (score: number) => (score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive");

function AgentCard({ agent }: { agent: AgentReport }) {
  const passed = agent.checks.filter((item) => item.passed).length;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="break-words text-base font-medium text-foreground">{agent.name}</h3>
          {agent.note && <p className="text-xs text-muted-foreground">{agent.note}</p>}
        </div>
        <p
          className={`shrink-0 text-lg font-semibold tabular-nums ${agent.score === null ? "text-muted-foreground" : scoreTone(agent.score)}`}
        >
          {agent.score === null ? "Non mesuré" : `${agent.score}/100`}
        </p>
      </div>
      {agent.checks.length > 0 && (
        <details>
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-sm text-primary">
            Contrôles réussis : {passed}/{agent.checks.length}
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {agent.checks.map((check) => (
              <li key={check.id} className="flex flex-col gap-0.5">
                <span className={check.passed ? "text-success" : "text-destructive"}>
                  <span aria-hidden>{check.passed ? "✓" : "✗"} </span>
                  <span className="sr-only">{check.passed ? "Réussi : " : "Échoué : "}</span>
                  {check.label}
                </span>
                <span className="break-words text-xs text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

// Résultat d'un audit SEO, et choix du site. Le formulaire est un GET : pas de JavaScript, et l'audit
// se lance à l'affichage de la page, côté serveur, pour le site choisi.
export function SeoDashboard({
  sites,
  selectedId,
  audit,
  error,
}: {
  sites: SiteOption[];
  selectedId: string | null;
  audit: SeoAudit | null;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <form method="get" action="/admin/seo" className={`${glass} flex flex-col gap-3 md:flex-row md:items-end`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="seo-site" className="text-xs uppercase tracking-wider text-muted-foreground">
            Site de la flotte
          </label>
          <select id="seo-site" name="site" defaultValue={selectedId ?? undefined} className={select}>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={submit}>
          Lancer l’audit
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {audit && (
        <>
          <section aria-labelledby="seo-score" className={`${glass} flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="seo-score" className="text-lg font-semibold text-foreground">
                Score global · {audit.siteName}
              </h2>
              <p className="break-all text-sm text-muted-foreground">{audit.url}</p>
            </div>
            <div className="flex flex-col gap-1 md:items-end">
              <p className={`text-4xl font-semibold tabular-nums ${scoreTone(audit.score)}`}>
                {audit.score}
                <span className="text-lg text-muted-foreground">/100</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {audit.coverage.measured} agent(s) sur {audit.coverage.total} mesuré(s) · audité le{" "}
                {dateFormat.format(new Date(audit.measuredAt))}
              </p>
            </div>
          </section>

          <section aria-labelledby="seo-agents" className={`${glass} flex flex-col gap-4`}>
            <h2 id="seo-agents" className="text-lg font-semibold text-foreground md:text-xl">
              Les onze agents
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {audit.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="seo-reco" className={`${glass} flex flex-col gap-3`}>
            <h2 id="seo-reco" className="text-lg font-semibold text-foreground md:text-xl">
              Recommandations
            </h2>
            {audit.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune recommandation : tous les contrôles mesurés passent.</p>
            ) : (
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground marker:text-primary">
                {audit.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
