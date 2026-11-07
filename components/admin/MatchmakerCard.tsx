"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignLeadsToPartner } from "@/app/admin/broker/matchmaker/actions";
import { PARTNERSHIP_LABELS, type PartnershipType } from "@/lib/broker/cpa-constants";
import type { LeadQuality } from "@/lib/broker/pricingEngine";
import { MAX_ASSIGN, type MatchmakerRow } from "@/lib/matchmaker";

// Carte d'un partenaire du Matchmaker : volume de leads compatibles, aperçu pour l'appel, et assignation.
// L'assignation se confirme en deux temps : elle crée une vente (CPL) ou une transmission (CPA), irréversible depuis l'écran.

const URGENCY_LABEL: Record<string, string> = { immediat: "Immédiat", "3_mois": "Dans 3 mois", "6_mois": "Dans 6 mois" };
const QUALITY_BADGE: Record<LeadQuality, { label: string; className: string }> = {
  FAIBLE: { label: "Faible", className: "bg-slate-700 text-slate-300 border border-slate-600" },
  MOYEN: { label: "Moyen", className: "bg-orange-900/50 text-orange-400 border border-orange-800" },
  FORT: { label: "Fort", className: "bg-emerald-900/50 text-emerald-300 border border-emerald-600" },
};

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";
const ASSIGN_BUTTON = `${BUTTON} border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25`;
const CANCEL_BUTTON = `${BUTTON} border-slate-700 bg-slate-800 text-white hover:bg-slate-700`;

const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

export function MatchmakerCard({ row }: { row: MatchmakerRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const { partner, leadCount, mode, preview, total, assignable } = row;
  const isCpa = mode === "CPA";
  const hasLeads = leadCount > 0;
  const tooMany = leadCount > MAX_ASSIGN;
  const badgeKey = (partner.partnershipType in PARTNERSHIP_LABELS ? partner.partnershipType : "CPL") as PartnershipType;

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await assignLeadsToPartner(partner.id, row.leadIds);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setConfirming(false);
      setMessage({
        kind: "ok",
        text:
          result.mode === "CPA"
            ? `${plural(result.count, "lead")} transmis à ${partner.company} (CPA, 0 €). Commission à suivre dans Ventes.`
            : `Lot créé : ${euros(result.total)}. ${result.billing === "stripe_pending" ? "Paiement Stripe à brancher." : "Facturation manuelle."}`,
      });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article aria-labelledby={`matchmaker-${partner.id}`} className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur md:p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`matchmaker-${partner.id}`} className="min-w-0 truncate text-base font-semibold text-white">
            {partner.company}
          </h2>
          {partner.isClient && <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">Client</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-md px-2 py-0.5 ${isCpa ? "border border-violet-500/40 bg-violet-500/15 text-violet-200" : "border border-sky-500/40 bg-sky-500/15 text-sky-200"}`}>
            {PARTNERSHIP_LABELS[badgeKey]}
          </span>
          {partner.city && <span className="text-slate-400">{partner.city}</span>}
        </div>
      </header>

      <p className={`text-2xl font-semibold tabular-nums ${hasLeads ? "text-emerald-300" : "text-slate-500"}`}>
        {hasLeads ? `🔥 ${plural(leadCount, "lead")} compatible${leadCount > 1 ? "s" : ""}` : "Aucun lead compatible"}
      </p>

      <p className="text-xs text-slate-400">
        Niches : {partner.targetNiches.join(", ") || "—"}
        <br />
        Zones : {partner.targetZipCodes.join(", ") || "—"}
      </p>

      {hasLeads && (
        <section aria-label="Aperçu des leads" className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {preview.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
                <span className="min-w-0 text-slate-100">
                  <span className="capitalize">{lead.niche.replace(/-/g, " ")}</span>
                  <span className="text-slate-400"> · CP </span>
                  <span className="tabular-nums">{lead.postalCode ?? "—"}</span>
                  <span className="text-slate-400"> · {lead.region ?? "—"}</span>
                  {lead.urgency && <span className="text-slate-400"> · {URGENCY_LABEL[lead.urgency] ?? lead.urgency}</span>}
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${QUALITY_BADGE[lead.quality].className}`}>{QUALITY_BADGE[lead.quality].label}</span>
              </li>
            ))}
          </ul>
          {leadCount > preview.length && <p className="text-xs text-slate-500">+ {leadCount - preview.length} autre(s) lead(s) compatible(s)</p>}
        </section>
      )}

      {tooMany && (
        <p role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Plus de {MAX_ASSIGN} leads compatibles : assignation en un clic impossible. Réduisez la sélection depuis le Lead Broker.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {message.text}
          </p>
        )}

        {confirming ? (
          <div role="region" aria-label="Confirmer l'assignation" className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-slate-900/80 p-3">
            {isCpa ? (
              <p className="text-sm text-slate-200">
                Transmettre {plural(leadCount, "lead")} à <span className="font-semibold text-white">{partner.company}</span>, sans prix : facturation 0 €.
              </p>
            ) : (
              <p className="text-sm text-slate-200">
                Créer un lot de {plural(leadCount, "lead")} pour <span className="font-semibold text-white">{partner.company}</span>. Total au tarif suggéré, remise de lot comprise :{" "}
                <span className="font-semibold tabular-nums text-white">{euros(total)}</span>.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={CANCEL_BUTTON}>
                Annuler
              </button>
              <button type="button" onClick={confirm} disabled={busy} className={ASSIGN_BUTTON}>
                {busy ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
            disabled={!hasLeads || !assignable}
            className={`${ASSIGN_BUTTON} w-full`}
          >
            {hasLeads ? `Assigner les ${leadCount} lead${leadCount > 1 ? "s" : ""}` : "Aucun lead à assigner"}
          </button>
        )}
      </div>
    </article>
  );
}
