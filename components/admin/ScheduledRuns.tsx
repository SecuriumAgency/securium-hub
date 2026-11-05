import type { FleetSnapshot, SeoSnapshot } from "@/lib/cron-store";
import { Panel } from "@/components/admin/Panel";
import { SortableRuns } from "@/components/admin/SortableRuns";

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
    <Panel id="seo-scheduled" title="Derniers audits planifiés" description={`Audité le ${dateFormat.format(new Date(snapshot.measuredAt))}.`}>
      <SortableRuns rows={snapshot.sites} />
    </Panel>
  );
}
