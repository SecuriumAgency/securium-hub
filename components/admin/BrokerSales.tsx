"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Ventes du broker : lots créés, acheteur, nombre de leads, montant et état du paiement.
// « Marquer payé » encaisse un lot en facturation manuelle (Stripe pas encore branché).
export type SaleRow = {
  id: string;
  name: string;
  totalPrice: number;
  status: "PENDING_PAYMENT" | "PAID";
  createdAt: string;
  buyer: string | null;
  leadCount: number;
};

const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });

const STATUS_BADGE: Record<SaleRow["status"], { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "En attente de paiement", className: "border-warning/40 bg-warning/10 text-warning" },
  PAID: { label: "Payé", className: "border-primary/40 bg-primary/10 text-primary" },
};

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary transition-all duration-300 hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function BrokerSales({ sales }: { sales: SaleRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const paid = sales.filter((sale) => sale.status === "PAID");
  const pending = sales.filter((sale) => sale.status === "PENDING_PAYMENT");
  const sum = (rows: SaleRow[]) => rows.reduce((total, row) => total + row.totalPrice, 0);
  const leadsSold = sales.reduce((total, sale) => total + sale.leadCount, 0);

  async function markPaid(sale: SaleRow) {
    setBusyId(sale.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/broker/batches/${encodeURIComponent(sale.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "Encaissement impossible." });
        return;
      }
      setMessage({ kind: "ok", text: `« ${sale.name} » marqué payé.` });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Encaissé", value: euros(sum(paid)), hint: `${paid.length} lot(s)` },
          { label: "En attente", value: euros(sum(pending)), hint: `${pending.length} lot(s)` },
          { label: "Leads vendus", value: String(leadsSold), hint: "toutes ventes" },
          { label: "Lots créés", value: String(sales.length), hint: "depuis le début" },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</dt>
            <dd className="text-xl font-semibold tabular-nums text-foreground md:text-2xl">{item.value}</dd>
            <p className="text-xs text-muted-foreground">{item.hint}</p>
          </div>
        ))}
      </dl>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"}`}>
          {message.text}
        </p>
      )}

      {sales.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Aucune vente pour l&apos;instant. Une vente apparaît ici dès qu&apos;un lot est créé depuis l&apos;onglet « Leads disponibles ».
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {sales.map((sale) => {
              const badge = STATUS_BADGE[sale.status];
              return (
                <li key={sale.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between md:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate text-sm font-medium text-foreground" title={sale.name}>
                      {sale.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateFormat.format(new Date(sale.createdAt))} · {sale.leadCount} lead{sale.leadCount > 1 ? "s" : ""} · acheteur : {sale.buyer ?? "inconnu"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{euros(sale.totalPrice)}</span>
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
                    {sale.status === "PENDING_PAYMENT" && (
                      <button type="button" onClick={() => markPaid(sale)} disabled={busyId !== null} className={BUTTON}>
                        {busyId === sale.id ? "Enregistrement…" : "Marquer payé"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Facturation manuelle : « Marquer payé » enregistre l&apos;encaissement. Le paiement Stripe se branchera sur ce même statut.
          </p>
        </>
      )}
    </div>
  );
}
