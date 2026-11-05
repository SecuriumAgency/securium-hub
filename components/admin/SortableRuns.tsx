"use client";

import { MobileSort, SortHeader, type SortColumn } from "@/components/admin/SortControls";
import { useSort, type Accessors } from "@/components/admin/useSort";
import type { SeoSnapshot } from "@/lib/cron-store";

// Derniers audits SEO planifiés : chaque colonne se trie au clic, et par liste sur mobile.
type Run = SeoSnapshot["sites"][number];
type RunKey = "name" | "score" | "measured" | "recommendations";

const ACCESSORS: Accessors<Run, RunKey> = {
  name: (row) => row.name,
  score: (row) => row.score,
  measured: (row) => row.measured,
  recommendations: (row) => row.recommendations,
};

const COLUMNS: SortColumn<RunKey>[] = [
  { key: "name", label: "Site" },
  { key: "score", label: "Score", defaultDirection: "desc" },
  { key: "measured", label: "Agents mesurés", defaultDirection: "desc" },
  { key: "recommendations", label: "Recommandations", defaultDirection: "desc" },
];

export function SortableRuns({ rows }: { rows: Run[] }) {
  const { sorted, sort, sortBy, invert } = useSort<Run, RunKey>(rows, ACCESSORS, { key: "score", direction: "desc" });

  return (
    <div className="flex flex-col gap-3">
      <MobileSort columns={COLUMNS} sort={sort} onSort={sortBy} onInvert={invert} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Score SEO de chaque site, lors du dernier audit planifié, trié par {COLUMNS.find((c) => c.key === sort.key)?.label.toLowerCase()}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {COLUMNS.map((column) => (
                <SortHeader key={column.key} column={column} sort={sort} onSort={sortBy} className="px-3 py-2 font-medium" />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((site) => (
              <tr key={site.id} className="transition-colors hover:bg-muted/60">
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
    </div>
  );
}
