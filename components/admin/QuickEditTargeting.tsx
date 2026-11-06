"use client";

import { useEffect, useId, useOptimistic, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateProspectTargeting } from "@/app/admin/outreach/targeting-actions";

// Ciblage d'un prospect en un clic : niches et zones d'intervention. Le changement s'affiche tout de suite
// (useOptimistic) ; si la base refuse, la valeur d'origine revient et un message le dit.

type Target = { niches: string[]; zones: string[] };

// Niches courantes, avec leur slug tel qu'il est stocké. « PAC » est un alias de pompe-a-chaleur (normalisation).
const NICHE_PRESETS: { slug: string; label: string }[] = [
  { slug: "toiture", label: "Toiture" },
  { slug: "isolation", label: "Isolation" },
  { slug: "pompe-a-chaleur", label: "PAC" },
  { slug: "renovation-energetique", label: "Rénovation énergétique" },
  { slug: "audit-energetique", label: "Audit énergétique" },
];

const ZONE = /^(\d{5}|\d{2,3}|2A|2B)$/i;
const labelOf = (slug: string) => NICHE_PRESETS.find((preset) => preset.slug === slug)?.label ?? slug.replace(/-/g, " ");

export function QuickEditTargeting({
  id,
  company,
  niches,
  zones,
  activity,
}: {
  id: string;
  company: string;
  niches: string[];
  zones: string[];
  activity: string | null;
}) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [zoneInput, setZoneInput] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saved, setSaved] = useState<Target>({ niches, zones });
  const [optimistic, setOptimistic] = useOptimistic<Target, Target>(saved, (_current, next) => next);
  const [, startTransition] = useTransition();

  // Retour du serveur : on garde la valeur confirmée comme base, pour que le rollback soit exact.
  useEffect(() => {
    setSaved({ niches, zones });
  }, [niches, zones]);

  // Message discret, qui disparaît seul.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Échap ferme le panneau.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function commit(next: Target) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await updateProspectTargeting(id, next.niches, next.zones);
      if (result.ok) {
        setToast({ kind: "ok", text: "Ciblage mis à jour" });
        router.refresh();
      } else {
        // Pas de rafraîchissement : React rétablit la valeur confirmée à la fin de la transition.
        setToast({ kind: "error", text: result.error });
      }
    });
  }

  function toggleNiche(slug: string) {
    const next = optimistic.niches.includes(slug) ? optimistic.niches.filter((item) => item !== slug) : [...optimistic.niches, slug];
    commit({ niches: next, zones: optimistic.zones });
  }

  function removeZone(zone: string) {
    commit({ niches: optimistic.niches, zones: optimistic.zones.filter((item) => item !== zone) });
  }

  function addZones(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tokens = zoneInput
      .split(/[,;\s]+/)
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean);
    const valid = tokens.filter((token) => ZONE.test(token));
    if (valid.length === 0) {
      setToast({ kind: "error", text: "Zone invalide : département (ex. 91) ou code postal à 5 chiffres." });
      return;
    }
    const merged = [...new Set([...optimistic.zones, ...valid])];
    setZoneInput("");
    commit({ niches: optimistic.niches, zones: merged });
  }

  const empty = optimistic.niches.length === 0 && optimistic.zones.length === 0;

  return (
    <div className="relative flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg px-1 text-left transition-colors hover:bg-slate-800/60 focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {empty ? (
          <span className="text-xs text-slate-400">+ Configurer cible</span>
        ) : (
          <>
            {optimistic.niches.map((slug) => (
              <span key={slug} className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">
                {labelOf(slug)}
              </span>
            ))}
            {optimistic.zones.map((zone) => (
              <span key={zone} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs tabular-nums text-slate-300">
                {zone}
              </span>
            ))}
          </>
        )}
      </button>

      {activity && <span className="text-xs text-slate-500">Secteur : {activity}</span>}

      {open && (
        <div id={panelId} role="region" aria-label={`Ciblage de ${company}`} className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Niches</p>
          <div className="grid grid-cols-2 gap-2">
            {NICHE_PRESETS.map((preset) => {
              const active = optimistic.niches.includes(preset.slug);
              return (
                <button
                  key={preset.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleNiche(preset.slug)}
                  className={`min-h-[36px] rounded-lg border px-2 text-xs transition-all duration-300 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    active ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Zones</p>
          <div className="flex flex-wrap gap-1.5">
            {optimistic.zones.map((zone) => (
              <span key={zone} className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs tabular-nums text-slate-200">
                {zone}
                <button type="button" aria-label={`Retirer ${zone}`} onClick={() => removeZone(zone)} className="px-1 text-slate-400 hover:text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addZones} className="flex gap-2">
            <input
              value={zoneInput}
              onChange={(event) => setZoneInput(event.target.value)}
              placeholder="ex. 91, 75"
              aria-label={`Ajouter des zones pour ${company}`}
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <button type="submit" className="min-h-[36px] rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 text-xs text-amber-200">
              Ajouter
            </button>
          </form>
        </div>
      )}

      {toast && (
        <p role={toast.kind === "error" ? "alert" : "status"} className={`fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-2 text-xs shadow-lg ${toast.kind === "error" ? "border-red-400/40 bg-red-950 text-red-200" : "border-emerald-400/40 bg-emerald-950 text-emerald-200"}`}>
          {toast.text}
        </p>
      )}
    </div>
  );
}
