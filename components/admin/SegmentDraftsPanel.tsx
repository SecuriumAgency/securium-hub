"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import type { ProspectionDraftRecord } from "@/lib/ai/chasseur-generator";
import { startPolling } from "@/lib/poll";

const POLL_INTERVAL_MS = 30_000;
const COPIED_MS = 2000;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

const buttonBase =
  "flex min-h-[44px] min-w-[44px] w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

type CardState = { deleting?: boolean; error?: string };

// Accroches par segment de l'agent Chasseur (GET /api/prospection/brouillons), relues toutes les 30 s.
// Un segment n'a pas de destinataire : l'équipe copie l'accroche et l'adapte, ou la supprime.
export function SegmentDraftsPanel() {
  const [drafts, setDrafts] = useState<ProspectionDraftRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  // Supprimées dans cet onglet : un relevé parti avant la suppression ne doit pas les faire réapparaître.
  const removed = useRef(new Set<string>());

  useEffect(
    () =>
      startPolling<{ drafts: ProspectionDraftRecord[] }>(
        "/api/prospection/brouillons",
        POLL_INTERVAL_MS,
        ({ drafts: next }) => {
          setDrafts(next.filter((draft) => !removed.current.has(draft.id)));
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [],
  );

  const copy = async (draft: ProspectionDraftRecord) => {
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setCopied(draft.id);
      window.setTimeout(() => setCopied((id) => (id === draft.id ? null : id)), COPIED_MS);
    } catch {
      // Presse-papiers refusé par le navigateur : le texte de la carte reste sélectionnable.
    }
  };

  const remove = async (draft: ProspectionDraftRecord) => {
    setCards((previous) => ({ ...previous, [draft.id]: { deleting: true } }));
    try {
      const response = await fetch(`/api/prospection/brouillons/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      // 404 : déjà supprimée ailleurs (autre onglet) ; la carte disparaît comme après un succès.
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Erreur ${response.status}.`);
      }
      removed.current.add(draft.id);
      setDrafts((list) => list?.filter((item) => item.id !== draft.id) ?? list);
    } catch (error) {
      setCards((previous) => ({
        ...previous,
        [draft.id]: { error: error instanceof Error ? error.message : "Suppression impossible." },
      }));
    }
  };

  return (
    <section aria-labelledby="segment-drafts-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="segment-drafts-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground md:text-xl">
          Accroches par segment (Chasseur)
          {drafts && (
            <span className="rounded-full border border-draft/30 bg-draft/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-draft">
              {drafts.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          Rédigées par Claude pour les segments du Lead Prospector (b2b-prospects.csv). Sans destinataire, elles ne
          partent jamais du Hub : copiez l&apos;accroche et adaptez-la à une entreprise du segment.
        </p>
        {failed && drafts && (
          <p role="status" className="text-xs text-warning">
            Actualisation en échec : nouvel essai dans 30 s.
          </p>
        )}
      </div>

      {!drafts && failed && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Accroches indisponibles : la base ne répond pas. Nouvel essai dans 30 s.
        </p>
      )}

      {!drafts && !failed && <div aria-hidden className="h-24 animate-pulse rounded-xl border border-border bg-card" />}

      {drafts?.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground md:p-6">
          Aucune accroche en attente. scripts/agent-chasseur-segments.mts rédige celles des nouveaux segments.
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              aria-busy={Boolean(cards[draft.id]?.deleting)}
              className="flex min-w-0 flex-col gap-4 rounded-xl border border-draft/20 bg-card p-4 md:p-6"
            >
              <header className="flex min-w-0 flex-col gap-1">
                <h3 className="break-words text-base font-semibold text-foreground">{draft.segment}</h3>
                <p className="break-words text-sm text-muted-foreground">{[draft.sector, draft.zone].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">
                  Rédigée le {dateFormat.format(new Date(draft.createdAt))} · {draft.model}
                </p>
              </header>

              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted p-4">
                <p className="break-words text-sm font-medium text-foreground">{draft.subject}</p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{draft.body}</p>
              </div>

              {cards[draft.id]?.error && (
                <p role="alert" className="text-sm text-destructive">
                  {cards[draft.id]?.error}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => copy(draft)}
                  className={`${buttonBase} cursor-pointer border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-primary`}
                >
                  {copied === draft.id ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                  {copied === draft.id ? "Copiée" : "Copier l'accroche"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(cards[draft.id]?.deleting)}
                  onClick={() => remove(draft)}
                  className={`${buttonBase} cursor-pointer border-border text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-destructive`}
                >
                  {cards[draft.id]?.deleting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
