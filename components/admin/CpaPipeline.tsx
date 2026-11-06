"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDealStatus, setExpectedCommission } from "@/app/admin/broker/cpa-actions";
import { DEAL_LABELS, DEAL_STATUSES, type DealStatus } from "@/lib/broker/cpa-constants";

// Pipeline CPA : chaque lead transmis à un apporteur d'affaires, avec son étape et la commission estimée.
// Chaque changement est enregistré tout de suite ; en cas d'échec, un message le dit et la valeur reste celle de la base.
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
const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

export function CpaPipeline({ rows }: { rows: CpaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [commissions, setCommissions] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.expectedCommission === null ? "" : String(row.expectedCommission)])),
  );

  async function changeStatus(id: string, status: DealStatus) {
    setBusy(id);
    setMessage(null);
    const result = await setDealStatus(id, status);
    setBusy(null);
    if (result.ok) {
      setMessage({ kind: "ok", text: `Étape mise à jour : ${DEAL_LABELS[status]}.` });
      router.refresh();
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  }

  async function saveCommission(id: string) {
    const raw = (commissions[id] ?? "").trim();
    const amount = raw === "" ? null : Number(raw.replace(",", "."));
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setMessage({ kind: "error", text: "Montant invalide : un nombre positif, en euros." });
      return;
    }
    setBusy(id);
    setMessage(null);
    const result = await setExpectedCommission(id, amount);
    setBusy(null);
    if (result.ok) {
      setMessage({ kind: "ok", text: "Commission estimée enregistrée." });
      router.refresh();
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  }

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

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"}`}>
          {message.text}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun lead transmis à un partenaire CPA pour l&apos;instant.</p>
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

      {rows.length > 0 && (
        <p className="text-xs text-slate-500">
          Estimation indicative : {euros(rows.reduce((total, row) => total + (row.expectedCommission ?? 0), 0))} de commissions estimées sur ces leads.
        </p>
      )}
    </section>
  );
}
