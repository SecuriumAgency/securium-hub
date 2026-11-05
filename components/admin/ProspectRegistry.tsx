"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { DRAFT_STATUS } from "@/lib/chasseur";
import { ProspectHistory } from "@/components/admin/ProspectHistory";

// Registre des prospects. Chaque colonne se trie au clic sur son en-tête (et par liste sur mobile).
// Dates à l'heure de Paris. Emails et téléphones sont des liens : mailto et tel.
export type RegistryRow = {
  id: string;
  company: string;
  email: string;
  phone: string | null;
  status: string;
  source: string;
  createdAt: string;
  lastContactAt: string;
};

type SortKey = "createdAt" | "lastContactAt" | "company" | "email" | "phone" | "status" | "source";
type Direction = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "createdAt", label: "Premier contact" },
  { key: "lastContactAt", label: "Dernier contact" },
  { key: "company", label: "Entreprise" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "status", label: "Statut" },
  { key: "source", label: "Source" },
];
const DATE_KEYS: SortKey[] = ["createdAt", "lastContactAt"];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const statusStyle: Record<string, string> = {
  Envoye: "border-primary/30 bg-primary/10 text-primary",
  Relance_1: "border-warning/30 bg-warning/10 text-warning",
  [DRAFT_STATUS]: "border-draft/30 bg-draft/10 text-draft",
};
const neutralStyle = "border-border bg-muted text-foreground";
const contactLink = "inline-flex min-h-[44px] max-w-full items-center truncate text-foreground transition-colors hover:text-primary";

function sortValue(row: RegistryRow, key: SortKey): number | string {
  switch (key) {
    case "createdAt":
      return Date.parse(row.createdAt);
    case "lastContactAt":
      return Date.parse(row.lastContactAt);
    case "phone":
      return row.phone ?? "";
    default:
      return row[key];
  }
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base", numeric: true });
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${statusStyle[status] ?? neutralStyle}`}>{status}</span>;
}

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`${contactLink} tabular-nums`}>
      {phone}
    </a>
  );
}

export function ProspectRegistry({ rows }: { rows: RegistryRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "lastContactAt", direction: "desc" });

  const sorted = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(sortValue(a, sort.key), sortValue(b, sort.key)));
  }, [rows, sort]);

  // Un nouvel en-tête part dans l'ordre le plus utile : dates les plus récentes d'abord, le reste de A à Z.
  const sortBy = (key: SortKey) =>
    setSort((current) => {
      if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      return { key, direction: DATE_KEYS.includes(key) ? "desc" : "asc" };
    });

  const label = COLUMNS.find((column) => column.key === sort.key)?.label ?? "";
  const directionLabel = sort.direction === "asc" ? "croissant" : "décroissant";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} prospect{rows.length > 1 ? "s" : ""} · trié par {label.toLowerCase()}, ordre {directionLabel}
        </p>
        <div className="flex items-center gap-2 md:hidden">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
            Trier par
            <select
              value={sort.key}
              onChange={(event) => sortBy(event.target.value as SortKey)}
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-foreground"
            >
              {COLUMNS.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSort((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          >
            {sort.direction === "asc" ? <ArrowUp aria-hidden className="size-4" /> : <ArrowDown aria-hidden className="size-4" />}
            Inverser
          </button>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card md:hidden">
        {sorted.map((row) => (
          <li key={row.id} className="flex min-w-0 flex-col gap-1 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h3 className="min-w-0 break-words text-base font-medium text-foreground">{row.company}</h3>
              <StatusBadge status={row.status} />
            </div>
            <a href={`mailto:${row.email}`} className={contactLink} title={row.email}>
              {row.email}
            </a>
            <PhoneLink phone={row.phone} />
            <p className="text-xs text-muted-foreground">
              Premier contact {dateFormat.format(new Date(row.createdAt))} · dernier {dateFormat.format(new Date(row.lastContactAt))} · {row.source}
            </p>
            <div className="mt-2 flex">
              <ProspectHistory prospectId={row.id} company={row.company} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Registre des prospects, trié par {label.toLowerCase()}, ordre {directionLabel}
          </caption>
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="px-4 py-3 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key)}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ${
                        active ? "text-primary" : ""
                      }`}
                    >
                      {column.label}
                      <Icon aria-hidden className="size-3.5" />
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="px-4 py-3 font-medium">
                Échanges
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-muted">
                <td className="whitespace-nowrap px-4 tabular-nums text-foreground">{dateFormat.format(new Date(row.createdAt))}</td>
                <td className="whitespace-nowrap px-4 tabular-nums text-muted-foreground">{dateFormat.format(new Date(row.lastContactAt))}</td>
                <td className="max-w-56 truncate px-4 font-medium text-foreground" title={row.company}>
                  {row.company}
                </td>
                <td className="max-w-56 px-4" title={row.email}>
                  <a href={`mailto:${row.email}`} className={contactLink}>
                    {row.email}
                  </a>
                </td>
                <td className="whitespace-nowrap px-4">
                  <PhoneLink phone={row.phone} />
                </td>
                <td className="whitespace-nowrap px-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="max-w-40 truncate px-4 text-muted-foreground" title={row.source}>
                  {row.source}
                </td>
                <td className="px-4 py-2">
                  <ProspectHistory prospectId={row.id} company={row.company} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
