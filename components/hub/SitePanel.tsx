"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Building2, CalendarDays, Crosshair, Crown, Globe2, Users, X } from "lucide-react";
import { formatNumber, type Site, type SiteStatus } from "@/lib/sites";
import { useLeads } from "@/lib/use-leads";
import { LeadsTable } from "./LeadsTable";

type Scope = "site" | "fleet";

const statusBadge: Record<SiteStatus, { label: string; badge: string; dot: string }> = {
  online: { label: "En ligne", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
  offline: { label: "Hors ligne", badge: "border-rose-400/30 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
  unknown: { label: "Statut inconnu", badge: "border-slate-400/30 bg-slate-400/10 text-slate-300", dot: "bg-slate-400" },
};

type SitePanelProps = {
  site?: Site;
  onClose: () => void;
};

// Panneau d'inspection, posé à droite par-dessus la scène, hors du <Canvas>.
export function SitePanel({ site, onClose }: SitePanelProps) {
  if (!site) return null;
  // key : chaque bâtiment rouvre le panneau sur sa vue par défaut.
  return <PanelCard key={site.id} site={site} onClose={onClose} />;
}

function PanelCard({ site, onClose }: { site: Site; onClose: () => void }) {
  // Abonné au store des leads : seul ce panneau (et le HUD) se re-rend à chaque actualisation.
  const { data, failed } = useLeads();
  const isHq = site.kind === "hq";
  // Le QG ouvre sur toute la flotte, un satellite sur ses propres leads.
  const [scope, setScope] = useState<Scope>(isHq ? "fleet" : "site");
  const siteLeads = useMemo(() => data?.leads.filter((lead) => lead.siteId === site.id), [data, site.id]);
  const leads = scope === "fleet" ? data?.leads : siteLeads;
  const metrics = data?.metrics[site.id];
  const status = statusBadge[site.status];
  const [x, y, z] = site.coords;

  return (
    <aside
      aria-label={`Inspection de ${site.name}`}
      className="absolute inset-x-4 top-24 bottom-12 z-50 flex flex-col rounded-2xl border border-white/15 bg-slate-900/75 p-4 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl sm:top-28 sm:right-6 sm:left-auto sm:w-[calc(100vw-3rem)] sm:p-5 lg:w-[min(68rem,calc(100vw-23rem))]"
    >
      <header className="flex items-start gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
            isHq
              ? "border-amber-300/30 bg-amber-400/15 text-amber-300"
              : "border-cyan-300/30 bg-cyan-400/10 text-cyan-300"
          }`}
        >
          {isHq ? <Crown aria-hidden className="size-5" /> : <Building2 aria-hidden className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{site.sector}</p>
          <h2 className="truncate text-base font-semibold text-white">{site.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${status.badge}`}>
          <span className="relative flex size-2">
            {site.status === "online" && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex size-2 rounded-full ${status.dot}`} />
          </span>
          {status.label}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <Crosshair aria-hidden className="size-3" />x {x} · y {y} · z {z}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat
          icon={<CalendarDays aria-hidden className="size-3.5" />}
          label="Leads (mois)"
          value={metrics ? formatNumber(metrics.leadsThisMonth) : "—"}
        />
        <Stat
          icon={<Users aria-hidden className="size-3.5" />}
          label="Leads (total)"
          value={metrics ? formatNumber(metrics.leadsTotal) : "—"}
        />
      </dl>

      <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Périmètre des leads" className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <ScopeButton active={scope === "site"} onClick={() => setScope("site")} count={siteLeads?.length}>
            {isHq ? <Crown aria-hidden className="size-3.5" /> : <Building2 aria-hidden className="size-3.5" />}
            {isHq ? "QG" : "Ce dépôt"}
          </ScopeButton>
          <ScopeButton active={scope === "fleet"} onClick={() => setScope("fleet")} count={data?.leads.length}>
            <Globe2 aria-hidden className="size-3.5" />
            Toute la flotte
          </ScopeButton>
        </div>
        <p className="text-[11px] text-slate-500">
          {failed && data ? (
            <span className="text-amber-300">Actualisation en échec · dernières données connues</span>
          ) : (
            "Heure de Paris · actualisé toutes les 20 s"
          )}
        </p>
      </div>

      <LeadsTable
        leads={leads}
        failed={failed}
        showSite={scope === "fleet"}
        caption={scope === "fleet" ? "Leads de toute la flotte" : `Leads de ${site.name}`}
      />
    </aside>
  );
}

function ScopeButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
        active ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
      <span className="rounded-md bg-white/10 px-1.5 text-[10px] tabular-nums text-slate-300">
        {count === undefined ? "…" : formatNumber(count)}
      </span>
    </button>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <dt className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}
