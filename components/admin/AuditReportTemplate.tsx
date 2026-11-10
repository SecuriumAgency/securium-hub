"use client";

import { Printer } from "lucide-react";
import type { Alert, AuditReport, Severity } from "@/lib/audit/types";

const GLASS =
  "break-inside-avoid rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6 print:border-slate-300 print:bg-white print:shadow-none print:backdrop-blur-none";

// Impression A4. À l'écran, rien ne change. Sur papier, les fonds disparaissent et le texte devient noir ; les pastilles
// de gravité et les scores gardent leur couleur (attribut data-print-keep). Le bouton et les écrans d'édition sont masqués
// par print:hidden.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  .audit-report, .audit-report *:not([data-print-keep]) {
    color: #0f172a !important;
    background: #ffffff !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    border-color: #cbd5e1 !important;
  }
}`;

// Couleurs par palier de score : vert à partir de 80, ambre à partir de 50, rouge en dessous.
const TONE = {
  emerald: { stroke: "#34d399", text: "text-emerald-400 print:text-emerald-700" },
  amber: { stroke: "#fbbf24", text: "text-amber-400 print:text-amber-700" },
  rose: { stroke: "#fb7185", text: "text-rose-400 print:text-rose-700" },
} as const;
const toneOf = (score: number) => (score >= 80 ? TONE.emerald : score >= 50 ? TONE.amber : TONE.rose);

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Critique", className: "border-rose-500/40 bg-rose-500/10 text-rose-300 print:text-rose-700" },
  warning: { label: "Alerte", className: "border-amber-500/40 bg-amber-500/10 text-amber-300 print:text-amber-700" },
  info: { label: "Info", className: "border-slate-500/40 bg-slate-500/10 text-slate-300 print:text-slate-700" },
};

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

function ScoreGauge({ label, score }: { label: string; score: number }) {
  const radius = 40;
  const length = 2 * Math.PI * radius;
  const tone = toneOf(score);
  return (
    <figure className={`${GLASS} flex flex-col items-center gap-3`}>
      <div className="relative size-28">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={tone.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * length} ${length}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span data-print-keep className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${tone.text}`}>
          {score}
        </span>
      </div>
      <figcaption className="text-sm font-semibold text-foreground">
        <span className="sr-only">{`${label} : ${score} sur 100`}</span>
        <span aria-hidden>{label}</span>
      </figcaption>
    </figure>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/60 p-3 print:border-slate-300">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function AlertItem({ alert }: { alert: Alert }) {
  const style = SEVERITY[alert.severity];
  return (
    <li className="flex items-start gap-3">
      <span data-print-keep className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.className}`}>
        {style.label}
      </span>
      <span className="text-sm text-foreground">{alert.message}</span>
    </li>
  );
}

// Rapport d'audit : scores, alertes classées, détail par sonde. Reçoit le JSON de POST /api/audit.
export function AuditReportTemplate({ report }: { report: AuditReport }) {
  const analyzed = new Date(report.analyzedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const globalTone = toneOf(report.scores.global);
  const { security, seo, performance } = report;
  const tls = security.tls;

  return (
    <article className="audit-report flex flex-col gap-6" aria-labelledby="rapport-titre">
      <style>{PRINT_CSS}</style>

      <header className={`${GLASS} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Rapport d&apos;audit B2B</p>
          <h2 id="rapport-titre" className="mt-1 break-all text-xl font-semibold text-foreground">
            {hostLabel(report.finalUrl ?? report.requestedUrl)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysé le {analyzed} · {report.durationMs} ms
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span data-print-keep className={`rounded-full border border-white/10 px-4 py-2 text-sm font-semibold ${globalTone.text}`}>
            Score global : {report.scores.global} / 100
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-background transition-opacity focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Printer aria-hidden className="size-4" />
            Générer PDF
          </button>
        </div>
      </header>

      <section aria-label="Scores par sonde" className="grid gap-4 sm:grid-cols-3">
        <ScoreGauge label="Sécurité" score={report.scores.security} />
        <ScoreGauge label="SEO" score={report.scores.seo} />
        <ScoreGauge label="Performance" score={report.scores.performance} />
      </section>

      <section aria-labelledby="alertes-titre" className={`${GLASS} flex flex-col gap-4`}>
        <h3 id="alertes-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
          Alertes ({report.alerts.length})
        </h3>
        {report.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune alerte sur ce périmètre.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {report.alerts.map((alert, index) => (
              <AlertItem key={`${index}-${alert.message}`} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="secu-titre" className={`${GLASS} flex flex-col gap-4`}>
        <h3 id="secu-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
          Sécurité · en-têtes et certificat
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {security.headers.map((header) => {
            const tone = header.points === header.maxPoints ? TONE.emerald : header.present ? TONE.amber : TONE.rose;
            return (
              <li
                key={header.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-background/60 p-3 text-sm print:border-slate-300"
              >
                <span className="break-all text-foreground">{header.label}</span>
                <span data-print-keep className={`shrink-0 font-semibold ${tone.text}`}>
                  {header.present ? `${header.points}/${header.maxPoints}` : "absent"}
                </span>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-3 sm:grid-cols-2">
          {tls ? (
            <>
              <Field label="Chaîne de confiance" value={tls.trusted ? "Reconnue" : `Non reconnue : ${tls.error ?? "motif inconnu"}`} />
              <Field label="Émetteur" value={tls.issuer ?? "Inconnu"} />
              <Field label="Expiration" value={tls.validTo ? new Date(tls.validTo).toLocaleDateString("fr-FR") : "Inconnue"} />
              <Field label="Jours restants" value={tls.daysLeft === null ? "—" : String(tls.daysLeft)} />
            </>
          ) : (
            <Field label="Protocole" value="HTTP uniquement : aucun certificat" />
          )}
        </dl>
      </section>

      <section aria-labelledby="seo-titre" className={`${GLASS} flex flex-col gap-4`}>
        <h3 id="seo-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
          SEO et structure
        </h3>
        {seo ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre" value={seo.title ? `${seo.title} (${seo.titleLength} car.)` : "Absent"} />
            <Field label="Meta description" value={seo.description ? `${seo.descriptionLength} caractères` : "Absente"} />
            <Field label="Balises H1" value={String(seo.h1Count)} />
            <Field label="Canonical" value={seo.canonical ?? "Absente"} />
            <Field label="Ratio texte/code" value={`${seo.textRatio} %`} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Analyse SEO non réalisée : la page n&apos;est pas un document HTML.</p>
        )}
      </section>

      <section aria-labelledby="perf-titre" className={`${GLASS} flex flex-col gap-4`}>
        <h3 id="perf-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
          Performance · baseline
        </h3>
        {performance ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Field label="TTFB" value={`${performance.ttfbMs} ms`} />
            <Field label="Statut HTTP" value={String(performance.statusCode)} />
            <Field label="Redirections" value={report.redirects.length === 0 ? "Aucune" : report.redirects.join(" → ")} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Site injoignable : aucune mesure.</p>
        )}
      </section>
    </article>
  );
}
