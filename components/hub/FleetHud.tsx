"use client";

import type { ReactNode } from "react";
import { CalendarDays, Radio, Users } from "lucide-react";
import type { SiteMetrics } from "@/lib/leads";
import { formatNumber, type Site } from "@/lib/sites";
import { useLeads } from "@/lib/use-leads";
import { HubNav } from "./HubNav";

export function FleetHud({ sites }: { sites: Site[] }) {
  const leads = useLeads().data;
  const onlineCount = sites.filter((site) => site.status === "online").length;
  const total = (metric: keyof SiteMetrics) =>
    leads ? formatNumber(sites.reduce((sum, site) => sum + (leads.metrics[site.id]?.[metric] ?? 0), 0)) : "—";

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">Securium Core</p>
          <h1 className="text-lg font-semibold text-white">Securium Hub</h1>
        </div>
        <HubNav />
        <dl className="flex flex-wrap gap-2">
          <Kpi icon={<Radio aria-hidden className="size-3.5" />} label="Sites en ligne" value={`${onlineCount}/${sites.length}`} />
          <Kpi icon={<CalendarDays aria-hidden className="size-3.5" />} label="Leads (mois)" value={total("leadsThisMonth")} />
          <Kpi icon={<Users aria-hidden className="size-3.5" />} label="Leads (total)" value={total("leadsTotal")} />
        </dl>
      </header>
      <p className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center text-xs text-slate-500">
        Clic : inspecter un bâtiment · Glisser : pivoter · Molette : zoomer · Échap : fermer
      </p>
    </>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 backdrop-blur-xl">
      <dt className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="text-base font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}
