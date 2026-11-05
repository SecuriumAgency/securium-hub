"use client";

import { DRAFT_STATUS } from "@/lib/chasseur";
import { ProspectHistory } from "@/components/admin/ProspectHistory";
import { MobileSort, SortHeader, type SortColumn } from "@/components/admin/SortControls";
import { useSort, type Accessors } from "@/components/admin/useSort";

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

type RegistryKey = "createdAt" | "lastContactAt" | "company" | "email" | "phone" | "status" | "source";

const COLUMNS: SortColumn<RegistryKey>[] = [
  { key: "createdAt", label: "Premier contact", defaultDirection: "desc" },
  { key: "lastContactAt", label: "Dernier contact", defaultDirection: "desc" },
  { key: "company", label: "Entreprise" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "status", label: "Statut" },
  { key: "source", label: "Source" },
];

const ACCESSORS: Accessors<RegistryRow, RegistryKey> = {
  createdAt: (row) => Date.parse(row.createdAt),
  lastContactAt: (row) => Date.parse(row.lastContactAt),
  company: (row) => row.company,
  email: (row) => row.email,
  phone: (row) => row.phone ?? "",
  status: (row) => row.status,
  source: (row) => row.source,
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const statusStyle: Record<string, string> = {
  Envoye: "border-primary/30 bg-primary/10 text-primary",
  Relance_1: "border-warning/30 bg-warning/10 text-warning",
  [DRAFT_STATUS]: "border-draft/30 bg-draft/10 text-draft",
};
const neutralStyle = "border-border bg-muted text-foreground";
const contactLink = "inline-flex min-h-[44px] max-w-full items-center truncate text-foreground transition-colors hover:text-primary";

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
  const { sorted, sort, sortBy, invert } = useSort<RegistryRow, RegistryKey>(rows, ACCESSORS, { key: "lastContactAt", direction: "desc" });
  const label = COLUMNS.find((column) => column.key === sort.key)?.label.toLowerCase() ?? "";
  const directionLabel = sort.direction === "asc" ? "croissant" : "décroissant";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} prospect{rows.length > 1 ? "s" : ""} · trié par {label}, ordre {directionLabel}
      </p>

      <MobileSort columns={COLUMNS} sort={sort} onSort={sortBy} onInvert={invert} />

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
          <caption className="sr-only">Registre des prospects, trié par {label}, ordre {directionLabel}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {COLUMNS.map((column) => (
                <SortHeader key={column.key} column={column} sort={sort} onSort={sortBy} />
              ))}
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
