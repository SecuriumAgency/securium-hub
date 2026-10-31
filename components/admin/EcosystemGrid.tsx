"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { IntegrationModule } from "@/lib/integrations/modules";

export type EcosystemModule = IntegrationModule & { openUrl: string | null };

type ModuleStatus = { id: string; configured: boolean; online: boolean | null; latencyMs: number | null };
type Phase = "loading" | "failed" | "ready";

// Ping court toutes les minutes : l'état reste à jour sans bloquer l'affichage des cartes.
const REFRESH_MS = 60_000;

// Grille des modules. L'état vient de /api/integrations/status ; chaque carte a une action principale.
export function EcosystemGrid({ modules }: { modules: EcosystemModule[] }) {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({});
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/integrations/status", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { modules: ModuleStatus[] };
        if (!active) return;
        setStatuses(Object.fromEntries(data.modules.map((module) => [module.id, module])));
        setPhase("ready");
      } catch {
        if (active) setPhase("failed");
      }
    }

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section aria-label="Modules de l'écosystème" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => (
        <ModuleCard key={module.id} module={module} status={statuses[module.id]} phase={phase} />
      ))}
    </section>
  );
}

function ModuleCard({ module, status, phase }: { module: EcosystemModule; status?: ModuleStatus; phase: Phase }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-base font-semibold text-foreground">{module.name}</h2>
          <p className="text-sm text-muted-foreground">{module.role}</p>
        </div>
        <StatusPill status={status} phase={phase} />
      </header>

      {module.bridge === "voice" ? <VoiceForm /> : <OpenLink module={module} />}
    </article>
  );
}

function StatusPill({ status, phase }: { status?: ModuleStatus; phase: Phase }) {
  if (phase === "loading") return <Pill tone="muted">Vérification…</Pill>;
  if (phase === "failed" || !status) return <Pill tone="muted">Statut indisponible</Pill>;
  if (!status.configured) return <Pill tone="muted">Non configuré</Pill>;
  if (status.online) {
    return <Pill tone="ok">{status.latencyMs === null ? "En ligne" : `En ligne · ${status.latencyMs} ms`}</Pill>;
  }
  return <Pill tone="error">Hors ligne</Pill>;
}

const TONES = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  error: "border-red-500/30 bg-red-500/10 text-red-400",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

// Bouton « Ouvrir » : une adresse publique est configurée, sinon la carte le signale au lieu d'afficher un lien mort.
function OpenLink({ module }: { module: EcosystemModule }) {
  if (!module.openUrl) return <p className="text-sm text-muted-foreground">Adresse d&apos;ouverture non configurée.</p>;

  return (
    <a href={module.openUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
      Ouvrir {module.name}
    </a>
  );
}

// Synthèse vocale : le texte part vers le pont VoiceStudio, l'audio revient et se lit dans la carte.
function VoiceForm() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Libère l'ancien fichier audio à chaque nouvelle génération et au démontage de la carte.
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Erreur ${response.status}.`);
      }
      setAudioUrl(URL.createObjectURL(await response.blob()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={generate} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Texte à lire (1000 caractères maximum)</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={3}
          required
          className="rounded-lg border border-border bg-background p-2 text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>
      <button type="submit" disabled={busy || text.trim().length === 0} className={buttonClass}>
        {busy ? "Génération…" : "Générer Voix"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {audioUrl && <audio controls src={audioUrl} className="w-full" />}
    </form>
  );
}
