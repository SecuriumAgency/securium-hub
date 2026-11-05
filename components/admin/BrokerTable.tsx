"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

// Lead Broker : leads disponibles, sélection multiple, vente à l'unité ou par lot.
// Déterministe : aucun appel à un modèle, le prix est saisi par l'utilisateur.

export type BrokerLead = {
  id: string;
  name: string;
  phone: string;
  niche: string;
  region: string | null;
  urgency: string | null;
  createdAt: string;
};

export type BrokerBuyer = { id: string; company: string; city: string | null };

const URGENCY_LABEL: Record<string, string> = { immediat: "Immédiat", "3_mois": "Dans 3 mois", "6_mois": "Dans 6 mois" };
const DEFAULT_UNIT_PRICE = 35;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

const FIELD =
  "min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";

export function BrokerTable({ leads, buyers }: { leads: BrokerLead[]; buyers: BrokerBuyer[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"unit" | "batch">("unit");
  const [unitPrice, setUnitPrice] = useState(String(DEFAULT_UNIT_PRICE));
  const [batchPrice, setBatchPrice] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const count = selected.size;
  const unit = Number(unitPrice.replace(",", "."));
  const batch = Number(batchPrice.replace(",", "."));
  const total = mode === "unit" ? unit * count : batch;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openModal() {
    setBatchPrice(String(Math.round(DEFAULT_UNIT_PRICE * count * 100) / 100));
    setMessage(null);
    setOpen(true);
  }

  // Échap ferme la fenêtre de vente.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!buyerId) return setMessage({ kind: "error", text: "Choisissez l'artisan acheteur." });
    if (mode === "unit" && !(unit > 0)) return setMessage({ kind: "error", text: "Prix unitaire invalide." });
    if (mode === "batch" && !(batch > 0)) return setMessage({ kind: "error", text: "Prix du lot invalide." });
    setBusy(true);
    try {
      const response = await fetch("/api/broker/create-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [...selected],
          buyerId,
          mode,
          ...(mode === "unit" ? { unitPrice: unit } : { totalPrice: batch }),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; total?: number; billing?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "Vente impossible." });
        return;
      }
      const billing = body.billing === "stripe_pending" ? " Paiement Stripe à brancher." : " Facturation manuelle.";
      setMessage({ kind: "ok", text: `Lot créé : ${euros(body.total ?? total)}.${billing}` });
      setSelected(new Set());
      setOpen(false);
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

  const allSelected = leads.length > 0 && count === leads.length;

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"}`}>
          {message.text}
        </p>
      )}

      {leads.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
          Aucun lead disponible à la vente. Seuls les leads dont la personne a accepté la cession apparaissent ici.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-slate-900/60">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner tous les leads"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))}
                    className="size-5 accent-amber-400"
                  />
                </th>
                {["Nom", "Téléphone", "Niche", "Département", "Urgence", "Reçu le"].map((title) => (
                  <th key={title} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {leads.map((lead) => (
                <tr key={lead.id} className="transition-colors duration-200 hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner le lead ${lead.name}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                      className="size-5 accent-amber-400"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white">{lead.name}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-200">{lead.phone}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.niche.replace(/-/g, " ")}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.region ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.urgency ? URGENCY_LABEL[lead.urgency] ?? lead.urgency : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-400">{dateFormat.format(new Date(lead.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {count > 0 && (
        <div role="region" aria-label="Actions de vente" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-slate-900/90 px-4 py-3 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)] backdrop-blur">
          <span className="text-sm text-white">{count} lead{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}</span>
          <button type="button" onClick={openModal} className={`${BUTTON} border-amber-400/60 bg-amber-400/15 text-amber-200`}>
            Vendre {count} lead{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm md:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
          >
            <h2 id="sale-title" className="text-lg font-semibold text-white">
              Vendre {count} lead{count > 1 ? "s" : ""}
            </h2>

            <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm text-slate-300">Mode de vente</legend>
                <label className="flex items-center gap-2 text-sm text-white">
                  <input type="radio" name="mode" value="unit" checked={mode === "unit"} onChange={() => setMode("unit")} className="accent-amber-400" />
                  À l&apos;unité : un prix par lead
                </label>
                <label className="flex items-center gap-2 text-sm text-white">
                  <input type="radio" name="mode" value="batch" checked={mode === "batch"} onChange={() => setMode("batch")} className="accent-amber-400" />
                  Par lot : un prix global
                </label>
              </fieldset>

              {mode === "unit" ? (
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Prix par lead (€)
                  <input inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className={FIELD} />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Prix du lot (€)
                  <input inputMode="decimal" value={batchPrice} onChange={(event) => setBatchPrice(event.target.value)} className={FIELD} />
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm text-slate-300">
                Artisan acheteur
                <select value={buyerId} onChange={(event) => setBuyerId(event.target.value)} className={FIELD}>
                  <option value="">Choisir dans la base de prospects</option>
                  {buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.company}
                      {buyer.city ? ` (${buyer.city})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-sm text-slate-300">
                Total : <span className="font-semibold tabular-nums text-white">{Number.isFinite(total) && total > 0 ? euros(total) : "—"}</span>
              </p>

              {message?.kind === "error" && (
                <p role="alert" className="text-sm text-red-300">
                  {message.text}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setOpen(false)} className={BUTTON}>
                  Annuler
                </button>
                <button type="submit" disabled={busy} className={`${BUTTON} border-amber-400/60 bg-amber-400/15 text-amber-200`}>
                  {busy ? "Enregistrement…" : "Confirmer la vente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
