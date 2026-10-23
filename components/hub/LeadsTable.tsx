"use client";

import { memo } from "react";
import { useNow } from "@/lib/clock";
import type { LeadRecord } from "@/lib/leads";
import { initialSites } from "@/lib/sites";

const NEW_LEAD_MS = 24 * 60 * 60 * 1000;
const SKELETON_ROWS = 7;
const siteNames = new Map(initialSites.map((site) => [site.id, site.name]));

// Heure de Paris imposée, comme le découpage des mois de /api/leads.
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

type LeadsTableProps = {
  // undefined : premier chargement en cours.
  leads?: LeadRecord[];
  failed: boolean;
  // Vue flotte : une colonne Dépôt indique le site émetteur.
  showSite: boolean;
  caption: string;
};

export function LeadsTable({ leads, failed, showSite, caption }: LeadsTableProps) {
  const now = useNow(60_000);
  const columns = ["Date", "Nom", "Téléphone", "Email", "Service", "Source", ...(showSite ? ["Dépôt"] : [])];

  if (!leads && failed) {
    return (
      <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
        Leads indisponibles : la base ne répond pas. Nouvel essai à la prochaine actualisation.
      </p>
    );
  }
  if (leads?.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
        Aucun lead reçu pour le moment.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-white/10 bg-slate-950/40">
      <table className="w-full min-w-[46rem] text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2.5 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={!leads} className="divide-y divide-white/5">
          {leads
            ? leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} showSite={showSite} fresh={now - Date.parse(lead.createdAt) < NEW_LEAD_MS} />
              ))
            : Array.from({ length: SKELETON_ROWS }, (_, row) => <SkeletonRow key={row} cells={columns.length} />)}
        </tbody>
      </table>
    </div>
  );
}

// Mémoïsé : à chaque tic de l'horloge, seules les lignes dont le badge « Nouveau » change se re-rendent.
const LeadRow = memo(function LeadRow({ lead, showSite, fresh }: { lead: LeadRecord; showSite: boolean; fresh: boolean }) {
  const createdAt = new Date(lead.createdAt);

  return (
    <tr className="transition-colors hover:bg-white/[0.04]">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
        <span className="text-slate-200">{dateFormat.format(createdAt)}</span>{" "}
        <span className="text-slate-500">{timeFormat.format(createdAt)}</span>
        {fresh && (
          <span className="ml-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[10px] font-medium text-cyan-300">
            Nouveau
          </span>
        )}
      </td>
      <td className="max-w-48 truncate px-3 py-2 font-medium text-white" title={lead.name}>
        {lead.name}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
        <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="text-slate-300 transition-colors hover:text-cyan-300">
          {lead.phone}
        </a>
      </td>
      <td className="max-w-56 truncate px-3 py-2" title={lead.email ?? undefined}>
        {lead.email ? (
          <a href={`mailto:${lead.email}`} className="text-slate-300 transition-colors hover:text-cyan-300">
            {lead.email}
          </a>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="max-w-40 truncate px-3 py-2 text-slate-300" title={lead.service}>
        {lead.service}
      </td>
      <td className="max-w-40 truncate px-3 py-2 text-slate-400" title={lead.source}>
        {lead.source}
      </td>
      {showSite && (
        <td className="whitespace-nowrap px-3 py-2">
          <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300">
            {siteNames.get(lead.siteId) ?? lead.siteId}
          </span>
        </td>
      )}
    </tr>
  );
});

function SkeletonRow({ cells }: { cells: number }) {
  return (
    <tr aria-hidden>
      {Array.from({ length: cells }, (_, cell) => (
        <td key={cell} className="px-3 py-2.5">
          <div className="h-3 w-full max-w-24 animate-pulse rounded bg-white/10" />
        </td>
      ))}
    </tr>
  );
}
