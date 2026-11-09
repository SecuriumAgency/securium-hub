"use client";

import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { repairFor } from "@/lib/matrix/repairs";
import { metricRows } from "@/lib/matrix/metrics";
import { MATRIX_SITES, MATRIX_TOOLS, ZONES } from "@/lib/matrix/tools";
import { formatNumber } from "@/lib/sites";
import { nodeStatus, useMatrixStore, type NodeStatus } from "@/store/useMatrixStore";

const STATUS_LABEL: Record<NodeStatus, string> = {
  active: "Opérationnel",
  working: "Tâche en cours",
  success: "Réparé · API 200",
  error: "Erreur ou hors ligne",
};

const STATUS_TONE: Record<NodeStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  working: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  success: "border-green-400/50 bg-green-400/15 text-green-200",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const FLEET_LABEL = { online: "En ligne", offline: "Hors ligne", unknown: "Statut inconnu" } as const;

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-40";

// Panneau HUD du nœud sélectionné : santé, alertes, journal de l'agent et actions manuelles.
export function MatrixHud() {
  const selectedId = useMatrixStore((state) => state.selectedId);
  const select = useMatrixStore((state) => state.select);
  const status = useMatrixStore((state) => (state.selectedId ? nodeStatus(state, state.selectedId) : "active"));
  const fleetStatus = useMatrixStore((state) => (state.selectedId ? state.fleet[state.selectedId] : undefined));
  const pending = useMatrixStore((state) => (state.selectedId ? (state.pendingBySite[state.selectedId] ?? 0) : 0));
  const repairing = useMatrixStore((state) => (state.selectedId ? Boolean(state.sites[state.selectedId]?.repairing) : false));
  const autopilot = useMatrixStore((state) => state.autopilot);
  const setAutopilot = useMatrixStore((state) => state.setAutopilot);
  const dispatchAgent = useMatrixStore((state) => state.dispatchAgent);
  const logs = useMatrixStore((state) => state.logs);
  const metrics = useMatrixStore((state) => state.metrics);
  const metricsFailed = useMatrixStore((state) => state.metricsFailed);

  if (!selectedId) return null;
  const tool = MATRIX_TOOLS.find((item) => item.id === selectedId);
  const site = MATRIX_SITES.find((item) => item.id === selectedId);
  if (!tool && !site) return null;

  const title = tool?.label ?? site?.label ?? selectedId;
  const scoped = logs.filter((entry) => entry.scope === selectedId).slice(-4);
  const repair = site ? repairFor(site.id) : null;
  const rows = metrics ? metricRows(selectedId, Boolean(site), metrics) : [];

  return (
    <aside
      aria-label={`Détail : ${title}`}
      className="absolute right-6 top-6 z-50 max-h-[calc(100dvh-3rem)] w-96 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-black/70 p-6 text-slate-100 backdrop-blur-xl"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/80">
            {tool ? ZONES[tool.zone].label : "Site client · Parc Sites"}
          </p>
          <h2 className="mt-1 truncate font-syne text-xl font-extrabold text-white">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <X aria-hidden className="size-4" />
          <span className="sr-only">Fermer le panneau</span>
        </button>
      </header>

      <p className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {STATUS_LABEL[status]}
      </p>

      {tool && <p className="mt-4 text-sm leading-relaxed text-slate-300">{tool.description}</p>}

      {site && (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Santé (Vercel)</dt>
            <dd className="mt-1 font-medium text-white">{FLEET_LABEL[fleetStatus ?? "unknown"]}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">
              {metrics?.traffic?.bySite[site.id] ? `Sessions (${metrics.traffic.date})` : "Trafic de référence"}
            </dt>
            <dd className="mt-1 font-medium text-white">
              {formatNumber(metrics?.traffic?.bySite[site.id]?.sessions ?? site.traffic)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Alertes en attente</dt>
            <dd className="mt-1 font-medium text-white">{pending}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Core Web Vitals</dt>
            <dd className="mt-1 text-xs text-slate-400">
              Non mesurés ici :{" "}
              <Link href="/admin/seo" className="text-cyan-300 underline underline-offset-2">
                voir l&apos;Audit SEO
              </Link>
            </dd>
          </div>
        </dl>
      )}

      <section aria-label="Métriques en direct" className="mt-5">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Métriques en direct</h3>
        {rows.length > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <dt className="text-[11px] text-slate-400">{row.label}</dt>
                <dd className="mt-1 font-semibold tabular-nums text-white">{formatNumber(row.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {metricsFailed
              ? "Métriques indisponibles : base injoignable ou session expirée."
              : metrics
                ? "Aucune métrique reliée à ce module."
                : "Première lecture des métriques en cours…"}
          </p>
        )}
        {metrics && (
          <p className="mt-2 text-[11px] text-slate-500">
            Base de production · relevé à {new Date(metrics.generatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        )}
      </section>

      <section aria-label="Journal de l'agent" className="mt-5">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Félix Fix · activité</h3>
        {scoped.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Aucune action enregistrée pour ce module.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 font-mono text-[11px] text-slate-300">
            {scoped.map((entry) => (
              <li key={entry.id} className="leading-snug">
                <span className="text-slate-500">
                  [{new Date(entry.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}]
                </span>{" "}
                {entry.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {tool?.autopilot && (
        <button
          type="button"
          role="switch"
          aria-checked={autopilot}
          onClick={() => setAutopilot(!autopilot)}
          className={`${actionClass} mt-5 w-full ${autopilot ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-slate-300"}`}
        >
          Pilote automatique : {autopilot ? "activé" : "désactivé"}
        </button>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {tool &&
          (tool.external ? (
            <a href={tool.href} target="_blank" rel="noopener noreferrer" className={`${actionClass} border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20`}>
              Ouvrir {tool.label}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : (
            <Link href={tool.href} className={`${actionClass} border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20`}>
              Ouvrir l&apos;admin dédiée
            </Link>
          ))}

        {site && site.url && (
          <a href={site.url} target="_blank" rel="noopener noreferrer" className={`${actionClass} border-white/15 bg-white/5 text-slate-200 hover:bg-white/10`}>
            Voir le site
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}

        {site && (
          <button
            type="button"
            disabled={!repair || repairing}
            onClick={() => site && void dispatchAgent(site.id)}
            className={`${actionClass} border-orange-400/40 bg-orange-400/10 text-orange-100 hover:bg-orange-400/20`}
          >
            {repairing ? "Réparation en cours…" : repair ? "Forcer la réparation Félix Fix" : "Aucune réparation automatique"}
          </button>
        )}
      </div>
    </aside>
  );
}
