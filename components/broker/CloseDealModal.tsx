"use client";

import { useEffect, useId, useState } from "react";
import { calculateCPACommission, cpaCommissionTier } from "@/lib/commission-calculator";

// Clôture d'un lead CPA : le montant HT du chantier donne la commission due, affichée à chaque frappe.
// Le composant ne lit ni n'écrit la base : il transmet le montant et la commission à onConfirm, au parent d'enregistrer.

type CloseDealModalProps = {
  leadName: string;
  onClose: () => void;
  onConfirm: (montantHT: number, commission: number) => void;
  /** Enregistrement en cours : bouton désactivé. */
  busy?: boolean;
  /** Erreur de l'enregistrement, affichée dans la fenêtre pour que la saisie reste en place. */
  error?: string | null;
};

const FIELD =
  "min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";

const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

/** Montant saisi en euros. Vide : null. Non numérique, négatif ou infini : null aussi (le message d'erreur le dit). */
function parseMontant(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function CloseDealModal({ leadName, onClose, onConfirm, busy = false, error = null }: CloseDealModalProps) {
  const [montant, setMontant] = useState("");
  const titleId = useId();
  const inputId = useId();

  // Échap ferme la fenêtre, comme dans le Lead Broker.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const value = parseMontant(montant);
  const commission = value === null ? null : calculateCPACommission(value);
  const tier = value === null ? null : cpaCommissionTier(value);
  // Saisie présente mais refusée : un message le dit, plutôt qu'un silence.
  const rejected = montant.trim() !== "" && value === null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-white">
          Clôturer : {leadName}
        </h2>
        <p className="mt-1 text-sm text-slate-400">Saisissez le montant HT du chantier : la commission due s&apos;affiche aussitôt.</p>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (value !== null && commission !== null) onConfirm(value, commission);
          }}
        >
          <label htmlFor={inputId} className="flex flex-col gap-1 text-sm text-slate-300">
            Montant du chantier HT (€)
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoFocus
              value={montant}
              onChange={(event) => setMontant(event.target.value)}
              placeholder="ex. 12500"
              aria-invalid={rejected}
              aria-describedby={rejected ? `${inputId}-error` : undefined}
              className={FIELD}
            />
          </label>

          {rejected && (
            <p id={`${inputId}-error`} role="alert" className="text-sm text-red-300">
              Montant invalide : saisissez un montant positif ou nul, en euros.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}

          <div aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {commission !== null && tier !== null ? (
              <>
                <p className="text-sm text-slate-300">Commission due</p>
                <p className="text-3xl font-bold tabular-nums text-white">{euros(commission)}</p>
                <span className="w-fit rounded-md border border-emerald-600 bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  Palier : {tier.label}
                </span>
              </>
            ) : (
              <p className="text-sm text-slate-400">Renseignez un montant pour calculer la commission.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={`${BUTTON} border-slate-700 bg-slate-800 text-white hover:bg-slate-700`}>
              Annuler
            </button>
            <button
              type="submit"
              disabled={commission === null || busy}
              className={`${BUTTON} border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25`}
            >
              {busy ? "Enregistrement…" : "Valider la clôture"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
