import type { FleetSnapshot, SeoSnapshot } from "@/lib/cron-store";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

// Ligne d'état du dernier relevé des statuts, planifié chaque jour par Vercel Cron.
export function FleetRunNote({ snapshot }: { snapshot: FleetSnapshot | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      {snapshot
        ? `Relevé planifié des statuts : ${dateFormat.format(new Date(snapshot.checkedAt))}.`
        : "Aucun relevé planifié pour l’instant."}
    </p>
  );
}

// Derniers audits SEO planifiés, un par site de la flotte, lancés chaque lundi par Vercel Cron.
export function SeoRunTable({ snapshot }: { snapshot: SeoSnapshot | null }) {
  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">Aucun audit planifié pour l’instant.</p>;
  }
  return (
    <section aria-labelledby="seo-scheduled" className={`${glass} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <h2 id="seo-scheduled" className="text-lg font-semibold text-foreground md:text-xl">
          Derniers audits planifiés
        </h2>
        <p className="text-xs text-muted-foreground">Audité le {dateFormat.format(new Date(snapshot.measuredAt))}.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Score SEO de chaque site, lors du dernier audit planifié</caption>
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Site</th>
              <th scope="col" className="px-3 py-2 font-medium">Score</th>
              <th scope="col" className="px-3 py-2 font-medium">Agents mesurés</th>
              <th scope="col" className="px-3 py-2 font-medium">Recommandations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {snapshot.sites.map((site) => (
              <tr key={site.id} className="transition-colors hover:bg-muted">
                <td className="whitespace-nowrap px-3 py-3 font-medium text-foreground">{site.name}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-foreground">{site.score}/100</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                  {site.measured}/{site.total}
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">{site.recommendations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
