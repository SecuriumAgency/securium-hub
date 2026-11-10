"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Globe, Loader2, ScanLine } from "lucide-react";
import type { AuditReport } from "@/lib/audit/types";
import { AuditReportTemplate } from "./AuditReportTemplate";

const GLASS = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
// Messages d'attente : ils suivent les sondes dans l'ordre, sans indiquer une progression réelle.
const STEPS = ["Analyse SSL en cours…", "Lecture des en-têtes de sécurité…", "Analyse SEO du code source…", "Mesure du temps de réponse (TTFB)…"];

type Status = "idle" | "running" | "done" | "error";

// Contrôle rapide côté navigateur. Le serveur refait le même contrôle, avec les garde-fous anti-SSRF.
function checkInput(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? null : "Seuls les liens http et https sont acceptés.";
  } catch {
    return "Saisissez une adresse complète, par exemple https://exemple.fr";
  }
}

function readError(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : "L'audit a échoué.";
}

// Radar : deux anneaux, un balayage tournant, un point central. Figé si l'utilisateur réduit les animations.
function Radar() {
  return (
    <div aria-hidden className="relative mx-auto size-24">
      <div className="absolute inset-0 rounded-full border border-primary/30" />
      <div className="absolute inset-3 rounded-full border border-primary/20" />
      <div
        className="absolute inset-0 animate-spin rounded-full motion-reduce:animate-none"
        style={{ background: "conic-gradient(from 0deg, transparent 65%, color-mix(in oklab, var(--primary) 70%, transparent))" }}
      />
      <div className="absolute inset-[42%] rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
    </div>
  );
}

export function AuditScanner() {
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Pendant l'analyse, le message d'attente change toutes les 1,4 s.
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => setStep((index) => (index + 1) % STEPS.length), 1400);
    return () => window.clearInterval(timer);
  }, [status]);

  async function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = checkInput(target);
    if (problem) {
      setError(problem);
      setStatus("error");
      return;
    }

    setStatus("running");
    setStep(0);
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
        cache: "no-store",
      });
      if (response.status === 401) {
        setError("Session expirée : reconnexion nécessaire.");
        setStatus("error");
        window.location.assign("/login");
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body));
        setStatus("error");
        return;
      }
      setReport(body as AuditReport);
      setStatus("done");
    } catch {
      setError("Le Hub n'a pas répondu. Réessayez dans un instant.");
      setStatus("error");
    }
  }

  const running = status === "running";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="audit-titre" className={`${GLASS} flex flex-col gap-5 print:hidden`}>
        <div className="flex flex-col gap-1">
          <h2 id="audit-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
            Moteur d&apos;audit automatisé
          </h2>
          <p className="text-sm text-muted-foreground">
            Sécurité des en-têtes et du certificat, SEO du code source et temps de réponse. Une requête passive par site.
          </p>
        </div>

        <form onSubmit={launch} className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Adresse du site à auditer</span>
            <Globe aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              inputMode="url"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="https://www.exemple.fr"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={running}
              className="w-full rounded-xl border border-primary/40 bg-slate-900/50 py-3 pl-10 pr-3 text-sm text-foreground shadow-[0_0_24px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-shadow placeholder:text-muted-foreground focus:shadow-[0_0_32px_-6px_color-mix(in_oklab,var(--primary)_85%,transparent)] focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={running || target.trim().length === 0}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-background transition-opacity focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <ScanLine aria-hidden className="size-4" />}
            {running ? "Analyse en cours…" : "Lancer l'Audit Automatisé"}
          </button>
        </form>

        {running && (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-2">
            <Radar />
            <p className="text-sm text-slate-300">{STEPS[step]}</p>
          </div>
        )}

        {status === "error" && error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {status === "done" && report && <AuditReportTemplate report={report} />}
    </div>
  );
}
