"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection, SortState } from "@/components/admin/useSort";

// Contrôles de tri partagés : en-tête de colonne cliquable (desktop) et liste déroulante avec inversion (mobile).
export type SortColumn<K extends string> = { key: K; label: string; defaultDirection?: SortDirection };

export function SortHeader<K extends string>({
  column,
  sort,
  onSort,
  className = "px-4 py-3 font-medium",
}: {
  column: SortColumn<K>;
  sort: SortState<K>;
  onSort: (key: K, defaultDirection?: SortDirection) => void;
  className?: string;
}) {
  const active = sort.key === column.key;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <button
        type="button"
        onClick={() => onSort(column.key, column.defaultDirection)}
        className={`inline-flex min-h-[44px] items-center gap-1.5 uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ${
          active ? "text-primary" : ""
        }`}
      >
        {column.label}
        <Icon aria-hidden className="size-3.5" />
      </button>
    </th>
  );
}

export function MobileSort<K extends string>({
  columns,
  sort,
  onSort,
  onInvert,
}: {
  columns: SortColumn<K>[];
  sort: SortState<K>;
  onSort: (key: K, defaultDirection?: SortDirection) => void;
  onInvert: () => void;
}) {
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center gap-2 md:hidden">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
        Trier par
        <select
          value={sort.key}
          onChange={(event) => {
            const column = columns.find((item) => item.key === event.target.value);
            onSort(event.target.value as K, column?.defaultDirection);
          }}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-foreground"
        >
          {columns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onInvert}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted"
      >
        <Arrow aria-hidden className="size-4" />
        Inverser
      </button>
    </div>
  );
}
