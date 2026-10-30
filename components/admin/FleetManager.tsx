import { ExternalLink, Plus } from "lucide-react";
import { formatNumber, type Site, type SiteStatus } from "@/lib/sites";

export type FleetRow = { site: Site; status: SiteStatus; leadsThisMonth: number; leadsTotal: number };

const statusLabel: Record<SiteStatus, string> = { online: "En ligne", offline: "Hors ligne", unknown: "Non vérifié" };
const statusStyle: Record<SiteStatus, string> = {
  online: "border-success/30 bg-success/10 text-success",
  offline: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

const columns = ["ID du site", "Nom du client", "URL de production", "Statut", "Leads générés"];
const contactLink = "inline-flex min-h-[44px] max-w-full items-center text-foreground transition-colors hover:text-primary";
const code = "rounded bg-muted px-1 font-mono text-xs text-foreground";

// Un site sans projet Vercel rattaché garde un statut fixe (lib/sites.ts) : l'infobulle le dit.
function StatusBadge({ site, status }: { site: Site; status: SiteStatus }) {
  return (
    <span
      title={site.vercelProject ? undefined : "Pas de projet Vercel rattaché : statut fixe."}
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

function SiteUrl({ url }: { url?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={contactLink} title={url}>
      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
      <ExternalLink aria-hidden className="ml-1 size-3.5 shrink-0" />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function LeadsCount({ row }: { row: FleetRow }) {
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-foreground">{formatNumber(row.leadsTotal)}</span>
      <span className="text-xs text-muted-foreground"> · ce mois {formatNumber(row.leadsThisMonth)}</span>
    </span>
  );
}

// Mode d'emploi pour ajouter un site à l'écosystème. Replié par défaut, sans JavaScript.
function NewSiteGuide() {
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <Plus aria-hidden className="size-4" />
        Nouveau Site (Eco System)
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground">
        <p>Un site se crée en cinq étapes. Il n’apparaît dans cette liste qu’une fois ajouté à lib/mock-data.json.</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 marker:text-primary">
          <li>
            Cloner le site modèle de l’écosystème dans un nouveau dépôt <code className={code}>SecuriumAgency/&lt;nom-du-site&gt;</code>.
          </li>
          <li>
            Créer le projet Vercel lié à ce dépôt. Noter son identifiant (<code className={code}>prj_…</code>, dans Settings › General) et son
            domaine de production.
          </li>
          <li>
            Dans <code className={code}>lib/mock-data.json</code>, ajouter le site : <code className={code}>id</code> unique en minuscules avec
            tirets, <code className={code}>name</code>, <code className={code}>url</code>, <code className={code}>kind</code> « site »,{" "}
            <code className={code}>sector</code>, <code className={code}>vercelProject</code>, <code className={code}>traffic</code> et{" "}
            <code className={code}>coords</code> (une position libre dans la scène 3D). Cette liste fixe les siteId autorisés :{" "}
            <code className={code}>/api/leads/inbound</code> refuse tout autre identifiant.
          </li>
          <li>
            Dans le site cloné, envoyer chaque formulaire à <code className={code}>POST /api/leads/inbound</code>, avec l’en-tête{" "}
            <code className={code}>Authorization: Bearer &lt;HUB_SECRET_KEY&gt;</code> et le <code className={code}>siteId</code> de l’étape 3.
          </li>
          <li>
            Déployer, puis vérifier que le site apparaît ici avec le statut « En ligne ». Ce statut dépend de{" "}
            <code className={code}>VERCEL_API_TOKEN</code>, à définir dans les variables du Hub.
          </li>
        </ol>
      </div>
    </details>
  );
}

// Parc des sites : une ligne par site (tableau à partir de md, cartes en dessous). Statut et leads viennent de la page.
export function FleetManager({ rows }: { rows: FleetRow[] }) {
  return (
    <section aria-labelledby="fleet-title" className="flex flex-col gap-4">
      <h2 id="fleet-title" className="text-lg font-semibold text-foreground md:text-xl">
        Sites de l’écosystème
      </h2>

      <NewSiteGuide />

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card md:hidden">
        {rows.map((row) => (
          <li key={row.site.id} className="flex min-w-0 flex-col gap-1 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h3 className="min-w-0 break-words text-base font-medium text-foreground">{row.site.name}</h3>
              <StatusBadge site={row.site} status={row.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{row.site.id}</p>
            <SiteUrl url={row.site.url} />
            <p className="text-sm">
              <LeadsCount row={row} />
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Sites de l’écosystème, un par ligne, avec leur statut et leurs leads</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.site.id} className="transition-colors hover:bg-muted">
                <td className="whitespace-nowrap px-4 font-mono text-xs text-muted-foreground">{row.site.id}</td>
                <td className="max-w-56 truncate px-4 font-medium text-foreground" title={row.site.name}>
                  {row.site.name}
                </td>
                <td className="max-w-72 px-4">
                  <SiteUrl url={row.site.url} />
                </td>
                <td className="whitespace-nowrap px-4">
                  <StatusBadge site={row.site} status={row.status} />
                </td>
                <td className="whitespace-nowrap px-4">
                  <LeadsCount row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
