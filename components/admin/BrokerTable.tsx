"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { calculateBatchDiscount, calculateSuggestedPrice, type LeadQuality } from "@/lib/broker/pricingEngine";
import { MobileSort, SortHeader, type SortColumn } from "@/components/admin/SortControls";
import { useSort, type Accessors } from "@/components/admin/useSort";
import { transmitLeadsToPartner } from "@/app/admin/broker/cpa-actions";

// Lead Broker : leads disponibles, sélection multiple, vente à l'unité ou par lot.
// Déterministe : aucun appel à un modèle. Le prix suggéré vient du moteur de pricing, il reste modifiable.

export type BrokerLead = {
  id: string;
  name: string;
  phone: string;
  niche: string;
  region: string | null;
  urgency: string | null;
  quality: LeadQuality;
  suggestedPrice: number | null;
  createdAt: string;
  buyers: LeadBuyer[];
  // Détail du projet (ex. « Installation PAC Air/Eau »), et exclusivité : vendu à un seul acheteur ou mutualisé.
  projectIntent: string | null;
  isExclusive: boolean;
};

// Acheteur compatible avec un lead (niche et zone) : client du broker ou artisan.
export type LeadBuyer = { id: string; company: string; isClient: boolean; score: number; label: string };

// Artisan compatible avec tous les leads sélectionnés (niche et zone), renvoyé par /api/broker/match.
export type EligibleArtisan = { id: string; company: string; city: string | null; score: number; label: string; partnershipType: string };

const URGENCY_LABEL: Record<string, string> = { immediat: "Immédiat", "3_mois": "Dans 3 mois", "6_mois": "Dans 6 mois" };
const QUALITY_BADGE: Record<LeadQuality, { label: string; className: string }> = {
  FAIBLE: { label: "Faible", className: "bg-slate-700 text-slate-300 border border-slate-600" },
  MOYEN: { label: "Moyen", className: "bg-orange-900/50 text-orange-400 border border-orange-800" },
  FORT: { label: "Fort", className: "bg-emerald-900/50 text-emerald-300 border border-emerald-600" },
};

// Prix suggéré d'un lead : celui enregistré à la capture, sinon recalculé avec la même grille.
const leadSuggested = (lead: BrokerLead) => lead.suggestedPrice ?? calculateSuggestedPrice(lead.quality, lead.niche);

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });
const euros = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

const FIELD =
  "min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";

// Acheteurs compatibles d'un lead : les meilleurs d'abord, avec leur score. Aucun acheteur = lead non vendable.
function BuyerBadges({ buyers }: { buyers: LeadBuyer[] }) {
  if (buyers.length === 0) {
    return <span className="inline-flex rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-200">Aucun acheteur compatible</span>;
  }
  const shown = buyers.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((buyer) => (
        <span
          key={buyer.id}
          title={buyer.label}
          className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            buyer.score === 100 ? "border border-emerald-600 bg-emerald-900/50 text-emerald-300" : "border border-orange-800 bg-orange-900/50 text-orange-300"
          }`}
        >
          {buyer.isClient && <span className="font-semibold text-amber-200">Client ·</span>}
          <span className="truncate">{buyer.company}</span>
          <span className="tabular-nums">{buyer.score} %</span>
        </span>
      ))}
      {buyers.length > shown.length && <span className="text-xs text-slate-400">+{buyers.length - shown.length}</span>}
    </div>
  );
}

type LeadKey = "createdAt" | "name" | "phone" | "niche" | "region" | "urgency" | "quality" | "buyers";

// Ordre des qualités : faible < moyen < fort. Accesseurs de tri : constantes de module.
const QUALITY_RANK: Record<LeadQuality, number> = { FAIBLE: 1, MOYEN: 2, FORT: 3 };
const LEAD_ACCESSORS: Accessors<BrokerLead, LeadKey> = {
  createdAt: (lead) => Date.parse(lead.createdAt),
  name: (lead) => lead.name,
  phone: (lead) => lead.phone,
  niche: (lead) => lead.niche.replace(/-/g, " "),
  region: (lead) => lead.region ?? "",
  urgency: (lead) => (lead.urgency ? (URGENCY_LABEL[lead.urgency] ?? lead.urgency) : ""),
  quality: (lead) => QUALITY_RANK[lead.quality],
  // Meilleur score d'abord, puis nombre d'acheteurs compatibles.
  buyers: (lead) => (lead.buyers[0]?.score ?? 0) * 1000 + lead.buyers.length,
};
const LEAD_COLUMNS: SortColumn<LeadKey>[] = [
  { key: "name", label: "Nom" },
  { key: "phone", label: "Téléphone" },
  { key: "niche", label: "Niche" },
  { key: "region", label: "Département" },
  { key: "urgency", label: "Urgence" },
  { key: "quality", label: "Qualité", defaultDirection: "desc" },
  { key: "createdAt", label: "Reçu le", defaultDirection: "desc" },
  { key: "buyers", label: "Acheteurs compatibles", defaultDirection: "desc" },
];

// Qualification du lead : exclusif (vendu une seule fois) ou mutualisé (vendable plusieurs fois).
// Couleurs de la charte sombre, équivalentes aux teintes violette et bleue demandées.
function LeadKindBadge({ exclusive }: { exclusive: boolean }) {
  return exclusive ? (
    <span className="inline-flex w-fit rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-200">
      💎 Exclusif
    </span>
  ) : (
    <span className="inline-flex w-fit rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
      🔄 Mutualisé
    </span>
  );
}

export function BrokerTable({ leads }: { leads: BrokerLead[] }) {
  const router = useRouter();
  const { sorted, sort, sortBy, invert } = useSort<BrokerLead, LeadKey>(leads, LEAD_ACCESSORS, { key: "createdAt", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"unit" | "batch">("unit");
  const [unitPrice, setUnitPrice] = useState("");
  const [batchPrice, setBatchPrice] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [artisans, setArtisans] = useState<EligibleArtisan[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const count = selected.size;
  const selectedKey = [...selected].sort().join(",");
  // Sans sélection, aucun artisan n'est proposé.
  const visibleArtisans = count > 0 ? artisans : [];
  // Acheteur en mode apporteur d'affaires (CPA) : transmission sans prix, sans lot, sans Stripe.
  const isCpa = visibleArtisans.find((artisan) => artisan.id === buyerId)?.partnershipType === "CPA";

  // Dès qu'un lead est sélectionné, les artisans compatibles avec TOUS les leads sont recherchés (niche et zone).
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    fetch(`/api/broker/match?leadIds=${encodeURIComponent(selectedKey)}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ artisans: EligibleArtisan[] }>) : { artisans: [] }))
      .then((body) => {
        if (cancelled) return;
        setArtisans(body.artisans);
        // L'acheteur choisi doit rester compatible après un changement de sélection.
        setBuyerId((current) => (body.artisans.some((artisan) => artisan.id === current) ? current : ""));
      })
      .catch(() => {
        if (!cancelled) setArtisans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);
  const unit = Number(unitPrice.replace(",", "."));
  const batch = Number(batchPrice.replace(",", "."));
  const total = mode === "unit" ? unit * count : batch;

  // Prix suggéré de la sélection, remise de lot comprise (10 % dès 10 leads).
  const selectedLeads = leads.filter((lead) => selected.has(lead.id));
  const suggestedSum = selectedLeads.reduce((sum, lead) => sum + leadSuggested(lead), 0);
  const suggestion = calculateBatchDiscount(count, suggestedSum);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Ouverture : les prix proposés sont ceux du moteur ; l'utilisateur peut les remplacer.
  function openModal() {
    setBatchPrice(String(suggestion.total));
    setUnitPrice(count > 0 ? String(Math.round((suggestion.total / count) * 100) / 100) : "");
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
    if (!buyerId) return setMessage({ kind: "error", text: "Choisissez l'acheteur." });
    if (isCpa) {
      setBusy(true);
      try {
        const result = await transmitLeadsToPartner([...selected], buyerId);
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error });
          return;
        }
        setMessage({ kind: "ok", text: `${result.count ?? count} lead(s) transmis au partenaire (CPA). Commissions à suivre dans l'onglet Ventes.` });
        setSelected(new Set());
        setOpen(false);
        router.refresh();
      } catch {
        setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
      } finally {
        setBusy(false);
      }
      return;
    }
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
        <>
        <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur md:block">
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
                {LEAD_COLUMNS.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    onSort={sortBy}
                    className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-400"
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sorted.map((lead) => (
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
                  <td className="px-4 py-3 text-sm">
                    <p className="font-medium text-white">{lead.name}</p>
                    <div className="mt-1 flex flex-col items-start gap-1">
                      <LeadKindBadge exclusive={lead.isExclusive} />
                      {lead.projectIntent && <p className="max-w-xs text-xs text-slate-400">{lead.projectIntent}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-200">{lead.phone}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.niche.replace(/-/g, " ")}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.region ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{lead.urgency ? URGENCY_LABEL[lead.urgency] ?? lead.urgency : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${QUALITY_BADGE[lead.quality].className}`}>
                      {QUALITY_BADGE[lead.quality].label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-400">{dateFormat.format(new Date(lead.createdAt))}</td>
                  <td className="px-4 py-3">
                    <BuyerBadges buyers={lead.buyers} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MobileSort columns={LEAD_COLUMNS} sort={sort} onSort={sortBy} onInvert={invert} />
        <ul className="flex flex-col gap-3 md:hidden">
          {sorted.map((lead) => (
            <li
              key={lead.id}
              className={`rounded-2xl border p-4 ${selected.has(lead.id) ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-white/[0.03]"}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Sélectionner le lead ${lead.name}`}
                  checked={selected.has(lead.id)}
                  onChange={() => toggle(lead.id)}
                  className="mt-1 size-5 shrink-0 accent-amber-400"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col items-start gap-1"><p className="min-w-0 truncate text-sm font-medium text-white">{lead.name}</p><LeadKindBadge exclusive={lead.isExclusive} />{lead.projectIntent && <p className="text-xs text-slate-400">{lead.projectIntent}</p>}</div>
                    <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${QUALITY_BADGE[lead.quality].className}`}>
                      {QUALITY_BADGE[lead.quality].label}
                    </span>
                  </div>
                  <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="text-sm tabular-nums text-amber-200 underline-offset-4 hover:underline">
                    {lead.phone}
                  </a>
                  <p className="break-words text-xs text-slate-300">
                    {lead.niche.replace(/-/g, " ")} · {lead.region ?? "—"} · {lead.urgency ? URGENCY_LABEL[lead.urgency] ?? lead.urgency : "—"}
                  </p>
                  <BuyerBadges buyers={lead.buyers} />
                  <p className="text-xs tabular-nums text-slate-500">{dateFormat.format(new Date(lead.createdAt))}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {count > 0 && (
        <div role="region" aria-label="Actions de vente" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-slate-900/90 px-4 py-3 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)] backdrop-blur">
          <span className="text-sm text-white">
            {count} lead{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""} · {visibleArtisans.length} artisan{visibleArtisans.length > 1 ? "s" : ""} compatible{visibleArtisans.length > 1 ? "s" : ""}
          </span>
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
              {!isCpa && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                <p>
                  Prix total suggéré : <span className="font-semibold tabular-nums text-white">{euros(suggestion.total)}</span>
                </p>
                {suggestion.discount > 0 && (
                  <p className="text-xs text-emerald-300">Remise de lot de {Math.round(suggestion.rate * 100)} % incluse ({euros(suggestion.discount)}).</p>
                )}
                <p className="text-xs text-slate-500">Vous pouvez remplacer ce prix ci-dessous avant de confirmer.</p>
              </div>
              )}

              {!isCpa && (
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
              )}

              {isCpa ? (
                <p className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-xs text-violet-200">
                  Transmission sans prix : le partenaire est rémunéré à la commission, une fois le chantier signé.
                </p>
              ) : mode === "unit" ? (
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

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm text-slate-300">Acheteur compatible</legend>
                {visibleArtisans.length === 0 ? (
                  <p className="rounded-lg border border-white/10 p-3 text-xs text-slate-400">
                    Aucun artisan compatible avec cette sélection. Renseignez la niche et la zone de l&apos;artisan.
                  </p>
                ) : (
                  visibleArtisans.map((artisan) => (
                    <label
                      key={artisan.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-all duration-300 hover:bg-slate-800/50 ${
                        buyerId === artisan.id ? "border-amber-400/60 bg-amber-400/10" : "border-white/10"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="radio"
                          name="buyer"
                          value={artisan.id}
                          checked={buyerId === artisan.id}
                          onChange={() => setBuyerId(artisan.id)}
                          className="accent-amber-400"
                        />
                        <span className="truncate text-white">
                          {artisan.company}
                          {artisan.city ? ` (${artisan.city})` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                          artisan.score === 100 ? "border border-emerald-600 bg-emerald-900/50 text-emerald-300" : "border border-orange-800 bg-orange-900/50 text-orange-400"
                        }`}
                      >
                        {artisan.label}
                      </span>
                    </label>
                  ))
                )}
              </fieldset>

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
                  {busy ? "Enregistrement…" : isCpa ? "Transmettre au partenaire (CPA)" : "Confirmer la vente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
