"use client";

import { useState, type FormEvent } from "react";
import { DECLARATION_NICHES, type DeclarationNiche } from "@/lib/broker/declaration-rules";

// Formulaire de l'acheteur : il choisit lui-même ses métiers et ses zones. Ces critères décident des leads
// qu'il pourra acheter, et seulement ceux-là.
type Props = {
  token: string;
  company: string;
  initialNiches: DeclarationNiche[];
  initialZones: string[];
};

const FIELD =
  "w-full min-h-[52px] rounded-xl border border-white/10 bg-slate-900/70 px-4 text-base text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40";
const PRIMARY =
  "min-h-[52px] w-full rounded-xl bg-amber-400 px-5 text-base font-semibold text-slate-950 transition-all duration-300 hover:bg-amber-300 hover:shadow-[0_0_24px_-6px_rgba(251,191,36,0.65)] focus-visible:outline-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60";

export function BuyerDeclarationForm({ token, company, initialNiches, initialZones }: Props) {
  const [niches, setNiches] = useState<DeclarationNiche[]>(initialNiches);
  const [zones, setZones] = useState(initialZones.join(", "));
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggle(value: DeclarationNiche) {
    setNiches((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
    setStatus("idle");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/partenaire/declare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, niches, zones }),
      });
      if (response.ok) {
        setStatus("done");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Enregistrement impossible. Réessayez.");
      setStatus("error");
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      setStatus("error");
    }
  }

  const canSubmit = niches.length > 0 && zones.trim().length > 0 && status !== "sending";

  return (
    <section className="glass-panel w-full rounded-3xl p-5 md:p-8">
      <h1 className="text-2xl font-semibold leading-tight text-slate-50 md:text-3xl">Vos critères pour {company}</h1>
      <p className="mt-2 text-sm text-slate-400">
        Ces critères décident des leads que vous pourrez acheter : seulement ceux de vos métiers et de vos zones. Vous pouvez les modifier avec ce même lien.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-6" noValidate>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-base font-semibold text-slate-100">Vos métiers</legend>
          {(Object.keys(DECLARATION_NICHES) as DeclarationNiche[]).map((value) => (
            <label key={value} className="flex min-h-[44px] items-center gap-3 text-base text-slate-200">
              <input
                type="checkbox"
                checked={niches.includes(value)}
                onChange={() => toggle(value)}
                className="size-5 shrink-0 accent-amber-400"
              />
              <span>{DECLARATION_NICHES[value]}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="zones" className="text-base font-semibold text-slate-100">
            Vos zones
          </label>
          <p className="text-sm text-slate-400">Codes postaux ou départements, séparés par des virgules. Ex. : 95, 78, 75001</p>
          <input
            id="zones"
            name="zones"
            inputMode="text"
            autoComplete="off"
            value={zones}
            onChange={(event) => {
              setZones(event.target.value);
              setStatus("idle");
            }}
            className={FIELD}
          />
        </div>

        {status === "done" && (
          <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Vos critères sont enregistrés.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <button type="submit" disabled={!canSubmit} className={PRIMARY}>
          {status === "sending" ? "Enregistrement…" : "Enregistrer mes critères"}
        </button>
      </form>
    </section>
  );
}
