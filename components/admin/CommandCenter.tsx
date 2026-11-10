"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Box, Clapperboard, Globe, Server, type LucideIcon } from "lucide-react";
import { DailyWorkboard } from "@/components/admin/DailyWorkboard";
import { startPolling } from "@/lib/poll";
import type { ProspectionCounts } from "@/lib/prospection-counts";
import type { AgentStatus, AgentTelemetry, TelemetryReport } from "@/lib/telemetry";
import { useTelemetry, useTelemetryPolling } from "@/lib/use-telemetry";

// Compteurs de prospection : le rendu serveur donne la première valeur, puis /api/prospection/stats les rafraîchit.
const PROSPECTION_INTERVAL_MS = 30_000;

// Agents du Pulse. `match` reconnaît le nom que la télémétrie donne à l'agent.
const PULSE_AGENTS: { label: string; match: RegExp }[] = [
  { label: "Orchestrateur", match: /orchestr/i },
  { label: "Chasseur", match: /prospect|chasseur/i },
  { label: "CFO", match: /\bcfo\b/i },
];

// Chaque état porte sa couleur : une panne ou un agent absent se voit tout de suite.
const statusView: Record<AgentStatus | "absent" | "loading", { text: string; dot: string; tone: string }> = {
  running: { text: "En ligne", dot: "bg-success shadow-[0_0_10px_var(--success)]", tone: "text-success" },
  idle: { text: "En veille", dot: "bg-primary shadow-[0_0_10px_var(--primary)]", tone: "text-muted-foreground" },
  error: { text: "En erreur", dot: "bg-destructive shadow-[0_0_10px_var(--destructive)]", tone: "text-destructive" },
  unknown: { text: "Inconnu", dot: "bg-muted-foreground", tone: "text-amber-400" },
  absent: { text: "Hors ligne", dot: "bg-amber-400", tone: "text-amber-400" },
  loading: { text: "Chargement…", dot: "animate-pulse bg-muted-foreground", tone: "text-muted-foreground" },
};

function findAgent(agents: AgentTelemetry[], match: RegExp) {
  return agents.find((agent) => match.test(agent.name));
}

// Statut affiché : un rapport périmé ne dit plus ce qui tourne, on le signale au lieu d'afficher un vieux statut.
function pulseRows(report: TelemetryReport | null, stale: boolean) {
  return PULSE_AGENTS.map((entry) => {
    if (!report || stale) return { label: entry.label, ...statusView.absent };
    const agent = findAgent(report.agents, entry.match);
    return { label: entry.label, ...(agent ? statusView[agent.status] : statusView.absent) };
  });
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`glass-panel flex min-w-0 flex-col gap-4 rounded-2xl p-5 md:p-6 ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{title}</h2>
      {children}
    </section>
  );
}

export function CommandCenter({ summary }: { summary: ProspectionCounts }) {
  // Une seule source de données : le store de télémétrie, alimenté ici toutes les 10 s sur cette page.
  useTelemetryPolling();
  const { data, failed } = useTelemetry();
  const report = data?.report ?? null;
  const stale = data?.stale ?? true;
  // Squelette tant que la première réponse n'est pas arrivée : l'interface ne saute pas au chargement.
  const loading = !data && !failed;
  const rows = loading ? PULSE_AGENTS.map((entry) => ({ label: entry.label, ...statusView.loading })) : pulseRows(report, stale);

  const [counts, setCounts] = useState(summary);
  useEffect(
    () =>
      startPolling<ProspectionCounts>("/api/prospection/stats", PROSPECTION_INTERVAL_MS, (body) =>
        setCounts({ prospects: body.prospects, contacted: body.contacted, followUps: body.followUps }),
      ),
    [],
  );
  const processesOnline = report?.pm2.processes.filter((process) => process.status === "online").length ?? 0;
  const processesTotal = report?.pm2.processes.length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
      <Panel title="Pulse" className="xl:col-span-2">
        <ul className="flex flex-col gap-3" aria-live="polite">
          {rows.map((row) => (
            <li key={row.label} className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className={`flex items-center gap-2 ${row.tone}`}>
                <span aria-hidden className={`pulse-soft inline-block size-2.5 rounded-full ${row.dot}`} />
                {row.text}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <Server aria-hidden className="size-4 shrink-0" />
          {failed && !data
            ? "Télémétrie injoignable"
            : !report
              ? "En attente du poste"
              : stale
                ? "Rapport périmé"
                : `Serveurs : ${processesOnline} / ${processesTotal} en ligne`}
        </div>
      </Panel>

      <Panel title="Prospection" className="xl:col-span-2">
        <dl className="grid grid-cols-3 gap-3 text-center">
          <Figure label="En base" value={counts.prospects} />
          <Figure label="Démarchés" value={counts.contacted} />
          <Figure label="Relances" value={counts.followUps} />
        </dl>
        <Link
          href="/admin/outreach"
          className="mt-auto inline-flex min-h-[44px] items-center text-sm text-foreground transition-all duration-300 hover:text-primary"
        >
          Ouvrir la prospection →
        </Link>
      </Panel>

      <Panel title="Raccourcis" className="xl:col-span-2">
        <nav aria-label="Raccourcis">
          <ul className="flex flex-col gap-2">
            <Shortcut href="/admin/osint" label="OSINT" icon={Globe} />
            <Shortcut href="/" label="Hub 3D" icon={Box} />
            <Shortcut href="/admin/reels" label="Reels Studio" icon={Clapperboard} />
          </ul>
        </nav>
      </Panel>

      <div className="md:col-span-2 xl:col-span-6">
        <DailyWorkboard />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <dd className="text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString("fr-FR")}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function Shortcut({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_18px_-6px_var(--primary)] focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-primary" />
        {label}
      </Link>
    </li>
  );
}
