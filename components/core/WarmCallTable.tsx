"use client";

import { useState } from "react";
import { QuickEditTargeting } from "@/components/admin/QuickEditTargeting";
import { CALL_STATUSES, demoLink, departmentOf, type CallStatus } from "@/lib/warm-call";

// Pipeline de closing (Warm Calling) : prospects déjà contactés par email, à rappeler au téléphone.
// Chaque changement de statut est enregistré à part du registre et du Kanban.

export type WarmCallRow = {
  id: string;
  company: string;
  phone: string | null;
  activity: string | null;
  targetNiches: string[];
  targetZipCodes: string[];
  sentAt: string;
  callStatus: CallStatus | null;
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });

const HEAD = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400";
const CELL = "px-4 py-3 align-top text-sm text-slate-200";
const BUTTON =
  "inline-flex min-h-[40px] items-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-white transition-all duration-300 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";
const BUTTON_ACTIVE = "border-amber-400/60 bg-amber-400/15 text-amber-200";
const FIELD =
  "min-h-[40px] w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30";

export function WarmCallTable({ rows }: { rows: WarmCallRow[] }) {
  const [calls, setCalls] = useState<Record<string, CallStatus | null>>(() => Object.fromEntries(rows.map((row) => [row.id, row.callStatus])));
  const [postal, setPostal] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function setCall(row: WarmCallRow, value: CallStatus) {
    const next = calls[row.id] === value ? null : value;
    const previous = calls[row.id] ?? null;
    setCalls((current) => ({ ...current, [row.id]: next }));
    setErrors((current) => ({ ...current, [row.id]: "" }));
    setPending((current) => ({ ...current, [row.id]: true }));
    try {
      const response = await fetch("/api/outreach/call-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, callStatus: next }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      setCalls((current) => ({ ...current, [row.id]: previous }));
      setErrors((current) => ({ ...current, [row.id]: "Enregistrement impossible. Réessayez." }));
    } finally {
      setPending((current) => ({ ...current, [row.id]: false }));
    }
  }

  function generateLink(row: WarmCallRow) {
    const code = (postal[row.id] ?? "").trim();
    if (!departmentOf(code)) {
      setErrors((current) => ({ ...current, [row.id]: "Code postal à 5 chiffres requis pour le lien." }));
      return;
    }
    const link = demoLink(window.location.origin, row.activity, code);
    setErrors((current) => ({ ...current, [row.id]: "" }));
    if (link) setLinks((current) => ({ ...current, [row.id]: link }));
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Presse-papiers indisponible : le lien reste sélectionnable dans le champ.
    }
  }

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">Aucun prospect contacté pour l&apos;instant.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
      <table className="min-w-full divide-y divide-white/10">
        <thead className="bg-slate-900/60">
          <tr>
            <th scope="col" className={HEAD}>Nom de l&apos;entreprise</th>
            <th scope="col" className={HEAD}>Téléphone</th>
            <th scope="col" className={HEAD}>Ciblage B2B</th>
            <th scope="col" className={HEAD}>Date d&apos;envoi</th>
            <th scope="col" className={HEAD}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row) => {
            const current = calls[row.id] ?? null;
            const sent = new Date(row.sentAt);
            return (
              <tr key={row.id} className="transition-colors duration-200 hover:bg-slate-800/50">
                <td className={`${CELL} font-medium text-white`}>{row.company}</td>
                <td className={`${CELL} tabular-nums`}>
                  {row.phone ? (
                    <a href={`tel:${row.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-[40px] items-center hover:text-amber-300">
                      {row.phone}
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className={CELL}>
                  <QuickEditTargeting id={row.id} company={row.company} niches={row.targetNiches} zones={row.targetZipCodes} activity={row.activity} />
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums`}>{Number.isNaN(sent.getTime()) ? "—" : dateFormat.format(sent)}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex min-w-[18rem] flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Code postal de ${row.company}`}
                        inputMode="numeric"
                        maxLength={5}
                        placeholder="Code postal"
                        value={postal[row.id] ?? ""}
                        onChange={(event) => setPostal((cur) => ({ ...cur, [row.id]: event.target.value.replace(/\D/g, "") }))}
                        className={FIELD}
                      />
                      <button type="button" onClick={() => generateLink(row)} className={BUTTON}>
                        Générer lien de démo
                      </button>
                    </div>
                    {links[row.id] && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          readOnly
                          aria-label={`Lien de démo pour ${row.company}`}
                          value={links[row.id]}
                          onFocus={(event) => event.currentTarget.select()}
                          className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300"
                        />
                        <button type="button" onClick={() => copy(links[row.id])} className={BUTTON}>
                          Copier
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(CALL_STATUSES) as CallStatus[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={current === value}
                          disabled={pending[row.id]}
                          onClick={() => setCall(row, value)}
                          className={`${BUTTON} ${current === value ? BUTTON_ACTIVE : ""}`}
                        >
                          {CALL_STATUSES[value]}
                        </button>
                      ))}
                    </div>
                    {errors[row.id] && (
                      <p role="alert" className="text-xs text-red-300">
                        {errors[row.id]}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
