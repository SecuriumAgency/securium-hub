"use client";

import { useRouter } from "next/navigation";
import { setPartnershipType } from "@/app/admin/broker/cpa-actions";
import { createDeclarationLink } from "@/app/admin/broker/declaration-actions";
import { PARTNERSHIP_LABELS, type PartnershipType } from "@/lib/broker/cpa-constants";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

// Critères des artisans acheteurs : niches (corps de métier) et zones (codes postaux ou départements).
// Ces critères décident des leads qu'un artisan peut acheter. Enregistrés par /api/broker/artisan-targets.

export type ArtisanRow = {
  id: string;
  company: string;
  city: string | null;
  activity: string | null;
  targetNiches: string[];
  targetZipCodes: string[];
  // Vue inverse du matching : leads disponibles compatibles, et meilleur score (100 ou 80).
  compatibleLeads?: number;
  bestScore?: number | null;
  partnershipType?: string;
  // Part des six critères remplis (téléphone, e-mail, ville, métier, niches, zones), de 0 à 100.
  completeness?: number;
};

const FIELD =
  "min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-amber-400/60 bg-amber-400/15 px-4 text-sm font-medium text-amber-200 transition-all duration-300 hover:bg-amber-400/25 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50";

// Saisie libre séparée par des virgules, ou des espaces : « pac, isolation » ou « 95100 95 ».
const parseList = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

// Lien que l'acheteur ouvre pour choisir lui-même ses métiers et ses zones. L'admin le copie et l'envoie
// lui-même : rien n'est envoyé automatiquement. Le lien reste valable 30 jours, sans pouvoir être révoqué.
function DeclarationLinkButton({ buyerId }: { buyerId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    const result = await createDeclarationLink(buyerId);
    setBusy(false);
    if (!result.ok) {
      setLink(null);
      setError(result.error);
      return;
    }
    const url = `${window.location.origin}${result.path}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Copie refusée par le navigateur : le lien reste dans le champ, sélectionnable à la main.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-slate-400">
        Lien de déclaration : l&apos;acheteur choisit lui-même ses métiers et ses zones. Vous l&apos;envoyez vous-même.
      </p>
      <button type="button" onClick={generate} disabled={busy} className={BUTTON}>
        {busy ? "Génération…" : link ? "Régénérer le lien" : "Générer le lien de déclaration"}
      </button>
      {link && (
        <input
          readOnly
          value={link}
          aria-label="Lien de déclaration"
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function ArtisanTargets({ artisans }: { artisans: ArtisanRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<ArtisanRow | null>(null);
  const [niches, setNiches] = useState("");
  const [zones, setZones] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<string>("CPL");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? artisans.filter((artisan) => `${artisan.company} ${artisan.city ?? ""}`.toLowerCase().includes(needle))
      : artisans;
    return list.slice(0, 50);
  }, [artisans, query]);

  // Le formulaire est au-dessus de la liste : on le fait défiler à l'écran dès qu'un artisan est choisi.
  useEffect(() => {
    if (!current || !formRef.current) return;
    formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    formRef.current.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [current]);

  function pick(artisan: ArtisanRow) {
    setCurrent(artisan);
    setNiches(artisan.targetNiches.join(", "));
    setZones(artisan.targetZipCodes.join(", "));
    setMode(artisan.partnershipType ?? "CPL");
    setMessage(null);
  }

  // Mode d'achat : CPL (achat immédiat) ou CPA (apporteur d'affaires). Enregistré tout de suite.
  async function changeMode(next: string) {
    if (!current) return;
    setMode(next);
    const result = await setPartnershipType(current.id, next);
    if (result.ok) {
      setMessage({ kind: "ok", text: "Mode d'achat enregistré." });
      router.refresh();
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/broker/artisan-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artisanId: current.id,
          targetNiches: parseList(niches),
          targetZipCodes: parseList(zones),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "Enregistrement impossible." });
        return;
      }
      setMessage({ kind: "ok", text: "Critères enregistrés." });
      setCurrent(null);
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="artisans-title" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="artisans-title" className="text-lg font-semibold text-white">
          Critères des artisans acheteurs
        </h2>
        <p className="text-sm text-slate-400">
          Un artisan ne peut acheter que les leads de ses niches et de ses zones. Sans critères, il n&apos;apparaît dans aucune vente.
        </p>
        {!current && <p className="text-sm text-amber-200">Cliquez sur un artisan pour renseigner ses niches et ses zones.</p>}
      </div>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Rechercher un artisan
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou ville" className={FIELD} />
      </label>

      {current && (
        <form
          ref={formRef}
          onSubmit={save}
          aria-label={`Critères de ${current.company}`}
          className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-slate-900/80 p-4"
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-white">{current.company}</p>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Mode d&apos;achat
            <select value={mode} onChange={(event) => changeMode(event.target.value)} className={FIELD}>
              {(Object.keys(PARTNERSHIP_LABELS) as PartnershipType[]).map((value) => (
                <option key={value} value={value}>
                  {PARTNERSHIP_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
            <p className="text-xs text-slate-400">
              {current.targetNiches.length > 0 && current.targetZipCodes.length > 0
                ? `Actuellement : ${current.targetNiches.length} niche(s) · ${current.targetZipCodes.length} zone(s)`
                : "Non configuré : renseignez au moins une niche et une zone pour qu'il puisse acheter."}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Niches (corps de métier), séparées par des virgules
            <input value={niches} onChange={(event) => setNiches(event.target.value)} placeholder="ex. pac, isolation, toiture" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Zones (codes postaux ou départements)
            <input value={zones} onChange={(event) => setZones(event.target.value)} placeholder="ex. 95, 78, 75001" className={FIELD} />
          </label>
          <DeclarationLinkButton buyerId={current.id} />
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {message.text}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCurrent(null)} className="min-h-[44px] rounded-lg border border-slate-700 px-4 text-sm text-slate-300 hover:bg-slate-800">
              Annuler
            </button>
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy ? "Enregistrement…" : "Enregistrer les critères"}
            </button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun artisan ne correspond à cette recherche.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {visible.map((artisan) => {
            const configured = artisan.targetNiches.length > 0 && artisan.targetZipCodes.length > 0;
            const selected = current?.id === artisan.id;
            return (
              <li key={artisan.id}>
                <button
                  type="button"
                  onClick={() => pick(artisan)}
                  aria-pressed={selected}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-all duration-300 hover:bg-slate-800/50 ${
                    selected ? "border-amber-400/60 bg-amber-400/10" : "border-white/10"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-white">
                      {artisan.company}
                      {artisan.city ? ` · ${artisan.city}` : ""}
                    </span>
                    {artisan.completeness !== undefined && (
                      <span className={`truncate text-xs ${artisan.completeness === 100 ? "text-emerald-300" : "text-slate-300"}`}>
                        Complétude {artisan.completeness} %
                      </span>
                    )}
                    {artisan.partnershipType && (
                      <span className="truncate text-xs text-amber-200">
                        {PARTNERSHIP_LABELS[artisan.partnershipType as PartnershipType] ?? artisan.partnershipType}
                      </span>
                    )}
                    {artisan.compatibleLeads !== undefined && (
                      <span className={`truncate text-xs ${artisan.compatibleLeads > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                        {artisan.compatibleLeads} lead{artisan.compatibleLeads > 1 || artisan.compatibleLeads === 0 ? "s" : ""} compatible
                        {artisan.compatibleLeads > 1 || artisan.compatibleLeads === 0 ? "s" : ""}
                        {artisan.bestScore ? ` · meilleur ${artisan.bestScore} %` : ""}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${
                      configured ? "border border-emerald-600 bg-emerald-900/50 text-emerald-300" : "border border-slate-600 bg-slate-800 text-slate-400"
                    }`}
                  >
                    {configured ? `${artisan.targetNiches.length} niche(s) · ${artisan.targetZipCodes.length} zone(s)` : "Non configuré"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!current && message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
