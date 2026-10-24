"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, Loader2, Mail, Send, Users, X } from "lucide-react";
import { CONTACTED_STATUSES, type DraftRecord, type OutreachStats } from "@/lib/chasseur";
import { startPolling } from "@/lib/poll";

const POLL_INTERVAL_MS = 30_000;
// Durée du fondu de sortie d'une carte traitée, égale à duration-300.
const LEAVE_MS = 300;
const SKELETON_CARDS = 2;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

type Action = "validate" | "reject";
type CardState = { pending?: Action; leaving?: boolean; error?: string };

const buttonBase =
  "flex min-h-[44px] min-w-[44px] w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

// Live Tracking et brouillons de l'agent Chasseur, rafraîchis ensemble toutes les 30 s (une seule
// requête). Valider ou rejeter appelle l'API sans recharger la page ; la carte s'efface, les compteurs
// suivent aussitôt, puis la page relit son tableau.
export function DraftsPanel() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [stats, setStats] = useState<OutreachStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  // Traités dans cet onglet : un relevé parti avant le traitement ne doit pas les faire réapparaître.
  const handled = useRef(new Set<string>());

  useEffect(
    () =>
      startPolling<{ drafts: DraftRecord[]; stats: OutreachStats }>(
        "/api/outreach/drafts",
        POLL_INTERVAL_MS,
        ({ drafts: next, stats: counts }) => {
          setDrafts(next.filter((draft) => !handled.current.has(draft.id)));
          setStats(counts);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [],
  );

  const setCard = (id: string, state: CardState) => setCards((previous) => ({ ...previous, [id]: state }));

  const act = async (draft: DraftRecord, action: Action) => {
    setCard(draft.id, { pending: action });
    try {
      const response = await fetch(`/api/outreach/drafts/${encodeURIComponent(draft.id)}`, {
        method: action === "validate" ? "PATCH" : "DELETE",
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      // 404 : déjà traité ailleurs (autre onglet) ; la carte disparaît comme après un succès.
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Erreur ${response.status}.`);
      }
      handled.current.add(draft.id);
      setCard(draft.id, { leaving: true });
      // Compteurs mis à jour sans attendre le prochain relevé, qui les recalera de toute façon. Un prospect
      // déjà contacté avant le brouillon était déjà compté dans « Emails envoyés ».
      if (response.ok) {
        const firstContact = action === "validate" && !CONTACTED_STATUSES.includes(draft.previousStatus);
        setStats((counts) => counts && { ...counts, drafts: Math.max(0, counts.drafts - 1), sent: counts.sent + (firstContact ? 1 : 0) });
      }
      window.setTimeout(() => {
        setDrafts((list) => list?.filter((item) => item.id !== draft.id) ?? list);
        // Relit les compteurs et le tableau rendus par le serveur, sans rechargement.
        router.refresh();
      }, LEAVE_MS);
    } catch (error) {
      setCard(draft.id, { error: error instanceof Error ? error.message : "Action impossible." });
    }
  };

  return (
    <>
    <section aria-labelledby="live-title" className="flex flex-col gap-4">
      <h2 id="live-title" className="text-lg font-semibold text-foreground md:text-xl">
        Live Tracking
      </h2>
      <ul className="flex flex-col gap-4 md:flex-row">
        <StatCard icon={<Users aria-hidden className="size-5" />} label="Prospects ciblés" hint="Total dans la base" value={stats?.prospects} accent="text-primary" />
        <StatCard icon={<Inbox aria-hidden className="size-5" />} label="Réponses à valider" hint="Brouillons en attente" value={stats?.drafts} accent="text-draft" />
        <StatCard icon={<Send aria-hidden className="size-5" />} label="Emails envoyés" hint="Prospects déjà contactés" value={stats?.sent} accent="text-success" />
      </ul>
    </section>

    <section aria-labelledby="drafts-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="drafts-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground md:text-xl">
          Brouillons en attente (Chasseur)
          {drafts && (
            <span className="rounded-full border border-draft/30 bg-draft/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-draft">
              {drafts.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          Rédigés par Claude, jamais envoyés sans vous. Ouvrez l&apos;email dans votre messagerie et envoyez-le, puis
          « Valider &amp; Envoyer » enregistre l&apos;envoi (statut « Envoye »). « Rejeter » rend au prospect son statut
          d&apos;avant.
        </p>
        {failed && drafts && (
          <p role="status" className="text-xs text-warning">
            Actualisation en échec : nouvel essai dans 30 s.
          </p>
        )}
      </div>

      {!drafts && failed && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Brouillons indisponibles : la base ne répond pas. Nouvel essai dans 30 s.
        </p>
      )}

      {!drafts && !failed && (
        <ul aria-busy="true" className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} aria-hidden className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-6">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-20 w-full animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      )}

      {drafts?.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground md:p-6">
          Aucun brouillon en attente. L&apos;agent Chasseur en rédige du lundi au vendredi, entre 9h et 18h.
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} state={cards[draft.id] ?? {}} onAction={(action) => act(draft, action)} />
          ))}
        </ul>
      )}
    </section>
    </>
  );
}

// Carte de statistique : `value` undefined tant que le premier relevé n'est pas arrivé.
function StatCard({ icon, label, hint, value, accent }: { icon: ReactNode; label: string; hint: string; value?: number; accent: string }) {
  return (
    <li className="flex flex-1 items-center gap-4 rounded-xl border border-border bg-card p-4 md:p-6">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ${accent}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {value === undefined ? (
          <div aria-hidden className="mt-1 h-8 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <p className={`text-3xl font-semibold tabular-nums transition-colors duration-300 ${accent}`}>{value}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

function DraftCard({ draft, state, onAction }: { draft: DraftRecord; state: CardState; onAction: (action: Action) => void }) {
  const busy = Boolean(state.pending || state.leaving);
  const mailto = `mailto:${draft.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;

  return (
    <li
      aria-busy={busy}
      className={`flex min-w-0 flex-col gap-4 rounded-xl border border-draft/20 bg-card p-4 transition-all duration-300 motion-reduce:transition-none md:p-6 ${
        state.leaving ? "pointer-events-none -translate-y-1 scale-95 opacity-0" : "opacity-100"
      }`}
    >
      <header className="flex min-w-0 flex-col gap-1">
        <h3 className="break-words text-base font-semibold text-foreground">{draft.company}</h3>
        <p className="truncate text-sm text-muted-foreground" title={draft.email}>
          {draft.email}
        </p>
        <p className="text-xs text-muted-foreground">
          Avant : {draft.previousStatus} · rédigé le {dateFormat.format(new Date(draft.createdAt))}
        </p>
      </header>

      <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted p-4">
        <p className="break-words text-sm font-medium text-foreground">{draft.subject}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{draft.body}</p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={mailto}
          className={`${buttonBase} border-border bg-muted text-foreground hover:border-primary/40 focus-visible:outline-primary`}
        >
          <Mail aria-hidden className="size-4" />
          Ouvrir dans la messagerie
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("validate")}
          className={`${buttonBase} cursor-pointer border-success/30 bg-success/10 text-success hover:bg-success/20 focus-visible:outline-success`}
        >
          {state.pending === "validate" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          Valider &amp; Envoyer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("reject")}
          className={`${buttonBase} cursor-pointer border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive`}
        >
          {state.pending === "reject" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <X aria-hidden className="size-4" />}
          Rejeter
        </button>
      </div>
    </li>
  );
}
