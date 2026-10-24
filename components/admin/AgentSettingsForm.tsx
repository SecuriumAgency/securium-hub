"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { MAX_BRIEF_LENGTH, type AgentBrief } from "@/lib/chasseur";

type Settings = AgentBrief & { updatedAt: string };
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

const FIELDS: { name: keyof AgentBrief; label: string; placeholder: string }[] = [
  {
    name: "productDescription",
    label: "Ce que tu vends",
    placeholder: "Ex. : refonte de sites vitrines rapides et pensés pour le mobile, avec formulaire de devis.",
  },
  {
    name: "targetAudience",
    label: "Ton client idéal",
    placeholder: "Ex. : artisans et commerces de proximité en Île-de-France, site daté ou absent.",
  },
];

// Brief de l'agent Chasseur : lu à l'ouverture (GET /api/outreach/settings), enregistré sur demande (POST).
// L'agent le relit à chaque passage ; sans lui, il refuse de rédiger.
export function AgentSettingsForm() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [values, setValues] = useState<AgentBrief>({ productDescription: "", targetAudience: "" });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/outreach/settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!response.ok) throw new Error(`Erreur ${response.status}.`);
        const { settings } = (await response.json()) as { settings: Settings | null };
        setSaved(settings);
        if (settings) setValues({ productDescription: settings.productDescription, targetAudience: settings.targetAudience });
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: "error", message: `Brief illisible : ${error instanceof Error ? error.message : "réseau indisponible."}` });
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const trimmed = { productDescription: values.productDescription.trim(), targetAudience: values.targetAudience.trim() };
  const complete = Boolean(trimmed.productDescription && trimmed.targetAudience);
  const changed = trimmed.productDescription !== (saved?.productDescription ?? "") || trimmed.targetAudience !== (saved?.targetAudience ?? "");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setStatus({ kind: "saving" });
    try {
      const response = await fetch("/api/outreach/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimmed),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json().catch(() => null)) as { settings?: Settings; error?: string; details?: string[] } | null;
      if (!response.ok || !body?.settings) throw new Error(body?.details?.join(" ") ?? body?.error ?? `Erreur ${response.status}.`);
      setSaved(body.settings);
      setValues({ productDescription: body.settings.productDescription, targetAudience: body.settings.targetAudience });
      setStatus({ kind: "saved" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Enregistrement impossible." });
    }
  };

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="settings-title" className="text-lg font-semibold text-foreground md:text-xl">
          Configuration de l&apos;Agent
        </h2>
        <p className="text-sm text-muted-foreground">
          Le brief de l&apos;agent Chasseur : il le relit à chaque passage pour rédiger ses emails, et refuse de rédiger
          tant que les deux champs sont vides.
          {saved && <> Dernière modification le {dateFormat.format(new Date(saved.updatedAt))}.</>}
        </p>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-6" aria-busy={!loaded}>
        <div className="flex flex-col gap-4 md:flex-row">
          {FIELDS.map((field) => (
            <label key={field.name} className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{field.label}</span>
              <textarea
                name={field.name}
                value={values[field.name]}
                onChange={(event) => {
                  setValues((previous) => ({ ...previous, [field.name]: event.target.value }));
                  if (status.kind !== "saving") setStatus({ kind: "idle" });
                }}
                disabled={!loaded}
                required
                maxLength={MAX_BRIEF_LENGTH}
                rows={4}
                placeholder={field.placeholder}
                className="min-h-[44px] w-full resize-y rounded-lg border border-border bg-muted p-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              />
              <span className="self-end text-xs tabular-nums text-muted-foreground">
                {values[field.name].length} / {MAX_BRIEF_LENGTH}
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={!loaded || !complete || !changed || status.kind === "saving"}
            className="flex min-h-[44px] min-w-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {status.kind === "saving" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            Enregistrer le brief
          </button>
          <p aria-live="polite" className="text-sm">
            {status.kind === "saved" && <span className="text-success">Brief enregistré : l&apos;agent l&apos;utilisera au prochain passage.</span>}
            {status.kind === "error" && <span className="break-words text-destructive">{status.message}</span>}
            {status.kind === "idle" && loaded && !saved && <span className="text-warning">Aucun brief : l&apos;agent ne rédigera rien.</span>}
          </p>
        </div>
      </form>
    </section>
  );
}
