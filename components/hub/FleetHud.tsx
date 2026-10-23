import type { ReactNode } from "react";
import { Activity, Radio, Users } from "lucide-react";
import { formatNumber, type Site } from "@/lib/sites";

export function FleetHud({ sites }: { sites: Site[] }) {
  const onlineCount = sites.filter((site) => site.status === "online").length;
  const totalLeads = sites.reduce((sum, site) => sum + site.leads, 0);
  const totalTraffic = sites.reduce((sum, site) => sum + site.traffic, 0);

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">God Mode</p>
          <h1 className="text-lg font-semibold text-white">Securium Hub</h1>
        </div>
        <dl className="flex flex-wrap gap-2">
          <Kpi icon={<Radio aria-hidden className="size-3.5" />} label="Sites en ligne" value={`${onlineCount}/${sites.length}`} />
          <Kpi icon={<Users aria-hidden className="size-3.5" />} label="Leads" value={formatNumber(totalLeads)} />
          <Kpi icon={<Activity aria-hidden className="size-3.5" />} label="Trafic" value={formatNumber(totalTraffic)} />
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
