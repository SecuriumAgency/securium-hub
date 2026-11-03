"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Globe, Loader2, Search } from "lucide-react";
import { lookupDomain, type WhoisResult } from "@/app/actions/whois";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const champ =
  "w-full rounded-xl border border-white/10 bg-background py-3 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary";

// AAAA-MM-JJ devient JJ/MM/AAAA. Une valeur qui n'a pas ce format (« Inconnue ») est affichée telle quelle.
function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

// Recherche WHOIS d'un domaine : la saisie part vers la Server Action lookupDomain, le résultat s'affiche en cartes.
export function WhoisScanner() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<WhoisResult | null>(null);
  const [pending, startTransition] = useTransition();

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await lookupDomain(domain));
    });
  }

  return (
    <section aria-labelledby="whois-titre" className={`${glass} flex flex-col gap-5`}>
      <div className="flex flex-col gap-1">
        <h2 id="whois-titre" className="text-sm font-semibold uppercase tracking-wider text-primary">
          Scanner WHOIS
        </h2>
        <p className="text-sm text-muted-foreground">Disponibilité, registrar et date d&apos;expiration d&apos;un domaine.</p>
      </div>

      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Nom de domaine</span>
          <Globe aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="exemple.fr"
            autoComplete="off"
            spellCheck={false}
            required
            className={champ}
          />
        </label>
        <button
          type="submit"
          disabled={pending || domain.trim().length === 0}
          className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-background transition-opacity focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Search aria-hidden className="size-4" />}
          {pending ? "Recherche…" : "Rechercher"}
        </button>
      </form>

      {result && !result.ok && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="flex flex-col gap-4">
          <span
            className={`w-fit rounded-full border px-3 py-1 text-sm font-semibold ${
              result.isAvailable
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/40 bg-red-500/10 text-red-400"
            }`}
          >
            {result.isAvailable ? "Disponible" : "Réservé"}
          </span>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Registrar</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{result.registrar}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Expiration</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{formatDate(result.expiry)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Statut</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{result.status}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
