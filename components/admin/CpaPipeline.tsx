"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDealStatus, setExpectedCommission } from "@/app/admin/broker/cpa-actions";
import { Toast, type ToastState } from "@/components/admin/Toast";
import { CpaKanban } from "@/components/admin/CpaKanban";
import { CloseDealModal } from "@/components/broker/CloseDealModal";
import { DEAL_LABELS, DEAL_STATUSES, type DealStatus } from "@/lib/broker/cpa-constants";
import { commissionKpis, euros } from "@/lib/broker/cpa-kpi";

// Pipeline CPA : chaque lead transmis à un apporteur d'affaires, avec son étape et la commission estimée.
// Chaque changement est enregistré tout de suite ; un message le confirme ou dit l'erreur, et la valeur reste celle de la base.
export type CpaRow = {
  id: string;
  name: string;
  company: string | null;
  niche: string;
  dealStatus: DealStatus | null;
  expectedCommission: number | null;
  soldAt: string | null;
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const NETWORK_ERROR = "Connexion impossible. Réessayez.";

export function CpaPipeline({ rows }: { rows: CpaRow[] }) {
  const router = useRouter();
  // Transitions : les appels aux Server Actions ne bloquent pas l'interface. `busy` désigne la seule ligne en cours.
  const [, startStatusTransition] = useTransition();
  const [, startCommissionTransition] = useTransition();
  const [closingPending, startClosingTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  // Affichage : Kanban par étape (par défaut) ou tableau, où se saisissent les commissions et se clôt un lead.
  const [view, setView] = useState<"kanban" | "table">("kanban");
  // Clôture : le lead ouvert dans le calculateur, et l'erreur de son enregistrement.
  const [closing, setClosing] = useState<CpaRow | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.expectedCommission === null ? "" : String(row.expectedCommission)])),
  );

  // Enregistre l'étape et le signale. Le Kanban et le tableau affichent ensuite la valeur de la base.
  async function saveStatus(id: string, status: DealStatus) {
    try {
      const result = await setDealStatus(id, status);
      if (result.ok) {
        setToast({ kind: "ok", text: `Étape mise à jour : ${DEAL_LABELS[status]}.` });
        router.refresh();
      } else {
        setToast({ kind: "error", text: result.error });
      }
    } catch {
      setToast({ kind: "error", text: NETWORK_ERROR });
    }
  }

  function changeStatus(id: string, status: DealStatus) {
    startStatusTransition(async () => {
      setBusy(id);
      try {
        await saveStatus(id, status);
      } finally {
        setBusy(null);
      }
    });
  }

  function saveCommission(id: string) {
    const raw = (commissions[id] ?? "").trim();
    const amount = raw === "" ? null : Number(raw.replace(",", "."));
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setToast({ kind: "error", text: "Montant invalide : un nombre positif, en euros." });
      return;
    }
    startCommissionTransition(async () => {
      setBusy(id);
      try {
        const result = await setExpectedCommission(id, amount);
        if (result.ok) {
          setToast({ kind: "ok", text: "Commission estimée enregistrée." });
          router.refresh();
        } else {
          setToast({ kind: "error", text: result.error });
        }
      } catch {
        setToast({ kind: "error", text: NETWORK_ERROR });
      } finally {
        setBusy(null);
      }
    });
  }

  // Clôture : la commission calculée est enregistrée comme commission estimée. Le montant HT n'est pas stocké.
  function confirmClosing(commission: number) {
    if (!closing) return;
    const { id, name } = closing;
    setClosingError(null);
    startClosingTransition(async () => {
      try {
        const result = await setExpectedCommission(id, commission);
        if (result.ok) {
          setCommissions((current) => ({ ...current, [id]: String(commission) }));
          setClosing(null);
          setToast({ kind: "ok", text: `Commission de ${euros(commission)} enregistrée pour ${name}.` });
          router.refresh();
        } else {
          setClosingError(result.error);
        }
      } catch {
        setClosingError(NETWORK_ERROR);
      }
    });
  }

  // Commissions latentes (en cours) et sécurisées (signées ou payées), calculées depuis les leads affichés.
  const kpis = commissionKpis(rows);

  return (
    <section aria-labelledby="cpa-title" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="cpa-title" className="text-lg font-semibold text-white">
          Pipeline CPA : commissions
        </h2>
        <p className="text-sm text-slate-400">
          {rows.length} lead{rows.length > 1 ? "s" : ""} transmis à un apporteur d&apos;affaires. Suivez l&apos;étape et la commission estimée.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile
          label="Commissions latentes"
          value={euros(kpis.latent)}
          hint={`${kpis.latentCount} lead${kpis.latentCount > 1 ? "s" : ""} transmis ou en négociation`}
          tone="text-amber-300"
        />
        <KpiTile
          label="Commissions sécurisées"
          value={euros(kpis.secured)}
          hint={`${kpis.securedCount} lead${kpis.securedCount > 1 ? "s" : ""} signé, chantier démarré ou payé`}
          tone="text-emerald-300"
        />
      </dl>
      {kpis.unestimated > 0 && (
        <p className="text-xs text-slate-500">
          {kpis.unestimated} lead{kpis.unestimated > 1 ? "s" : ""} sans commission estimée : ils ne pèsent pas dans les totaux. Saisissez-la dans le tableau ou clôturez le lead.
        </p>
      )}

      <div role="group" aria-label="Affichage du pipeline" className="flex flex-wrap gap-2">
        {(
          [
            { id: "kanban", label: "Kanban par étape" },
            { id: "table", label: "Tableau et clôture" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={view === option.id}
            onClick={() => setView(option.id)}
            className={`min-h-[40px] rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              view === option.id ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-slate-700 text-slate-300 hover:bg-white/5"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun lead transmis à un partenaire CPA pour l&apos;instant.</p>
      ) : view === "kanban" ? (
        <CpaKanban rows={rows} onMove={saveStatus} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-slate-900/60">
              <tr>
                {["Lead", "Partenaire", "Niche", "Étape", "Commission estimée", "Transmis le"].map((title) => (
                  <th key={title} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-white">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{row.company ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{row.niche.replace(/-/g, " ")}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Étape de ${row.name}`}
                      value={row.dealStatus ?? "TRANSMIS"}
                      disabled={busy === row.id}
                      onChange={(event) => changeStatus(row.id, event.target.value as DealStatus)}
                      className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                    >
                      {DEAL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {DEAL_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        inputMode="decimal"
                        aria-label={`Commission estimée pour ${row.name}, en euros`}
                        value={commissions[row.id] ?? ""}
                        onChange={(event) => setCommissions((current) => ({ ...current, [row.id]: event.target.value }))}
                        onBlur={() => saveCommission(row.id)}
                        disabled={busy === row.id}
                        placeholder="0"
                        className="min-h-[40px] w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400">€</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Clôturer le lead ${row.name} et calculer la commission`}
                      onClick={() => {
                        setClosingError(null);
                        setClosing(row);
                      }}
                      disabled={busy === row.id}
                      className="mt-2 min-h-[40px] rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 text-xs font-medium text-amber-200 transition-all duration-300 hover:bg-amber-400/25 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50"
                    >
                      Clôturer
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-400">
                    {row.soldAt ? dateFormat.format(new Date(row.soldAt)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closing && (
        <CloseDealModal
          leadName={closing.name}
          onClose={() => {
            if (!closingPending) setClosing(null);
          }}
          onConfirm={(_montantHT, commission) => confirmClosing(commission)}
          busy={closingPending}
          error={closingError}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </section>
  );
}

function KpiTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd>
      <dd className="text-xs text-slate-500">{hint}</dd>
    </div>
  );
}
