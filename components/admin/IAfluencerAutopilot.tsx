"use client";

import { useState } from "react";

// Direction artistique, voix de marque et interrupteurs de l'Auto-Pilote (Stories et Reels).
// Enregistrés sur demande (POST /api/iafluencer/settings) ; le moteur les relit à chaque passage.

export type AutopilotSettings = {
  artDirection: string;
  brandVoice: string;
  autopilotStories: boolean;
  autopilotReels: boolean;
};

const LABEL = "text-sm text-foreground";
const FIELD =
  "min-w-0 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary";

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (value: boolean) => void; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-300 focus-visible:outline-2 focus-visible:outline-primary ${
          checked ? "border-amber-400/60 bg-amber-400/30" : "border-slate-700 bg-slate-800"
        }`}
      >
        <span className={`inline-block size-5 rounded-full bg-white transition-transform duration-300 ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export function IAfluencerAutopilot({ initial }: { initial: AutopilotSettings }) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const response = await fetch("/api/iafluencer/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setStatus(response.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="art-direction" className={LABEL}>
          Direction Artistique (Prompt Visuel Master)
        </label>
        <textarea
          id="art-direction"
          rows={3}
          value={settings.artDirection}
          onChange={(event) => setSettings((current) => ({ ...current, artDirection: event.target.value }))}
          placeholder="Ex. : style cyberpunk minimaliste, couleurs sombres et ambre, setup de bureau tech, photoréaliste"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="brand-voice" className={LABEL}>
          Voix de marque (légendes)
        </label>
        <textarea
          id="brand-voice"
          rows={2}
          value={settings.brandVoice}
          onChange={(event) => setSettings((current) => ({ ...current, brandVoice: event.target.value }))}
          placeholder="Ex. : direct, pédagogue, tutoiement amical, zéro jargon"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Auto-Pilote (Stories &amp; Reels)</h3>
        <Toggle
          label="Une Story par jour"
          detail="Instagram uniquement. Générée à partir de la direction artistique."
          checked={settings.autopilotStories}
          onChange={(value) => setSettings((current) => ({ ...current, autopilotStories: value }))}
        />
        <Toggle
          label="Deux Reels par semaine"
          detail="Mardi et vendredi, sur Instagram et TikTok connectés."
          checked={settings.autopilotReels}
          onChange={(value) => setSettings((current) => ({ ...current, autopilotReels: value }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-700 disabled:opacity-60"
        >
          {status === "saving" ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
        {status === "saved" && <span role="status" className="text-xs text-emerald-300">Réglages enregistrés.</span>}
        {status === "error" && (
          <span role="alert" className="text-xs text-red-300">
            Enregistrement impossible. Réessayez.
          </span>
        )}
      </div>
    </div>
  );
}
