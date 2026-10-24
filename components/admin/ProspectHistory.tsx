"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, X } from "lucide-react";
import { OUTBOUND, type MessageRecord } from "@/lib/chasseur";
import { startPolling } from "@/lib/poll";
import { useOverlay } from "./use-overlay";

const POLL_INTERVAL_MS = 30_000;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

type History = { messages: MessageRecord[] };

// Bouton « Historique » d'un prospect et son tiroir de conversation : plein écran sur mobile, panneau à
// droite à partir de md. Les échanges sont relus toutes les 30 s tant que le tiroir est ouvert.
export function ProspectHistory({ prospectId, company }: { prospectId: string; company: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOverlay(open, close, closeButton);

  useEffect(() => {
    if (!open) return;
    return startPolling<History>(
      `/api/outreach/messages/${encodeURIComponent(prospectId)}`,
      POLL_INTERVAL_MS,
      (data) => {
        setHistory(data);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [open, prospectId]);

  // Rendu dans body : le bouton vit dans une cellule de tableau ou une carte, dont le conteneur
  // (défilement, empilement) ne doit ni rogner ni recouvrir le tiroir.
  const drawer = (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`history-${prospectId}`}
        className="absolute inset-0 flex flex-col bg-background md:inset-y-0 md:left-auto md:right-0 md:w-full md:max-w-lg md:border-l md:border-border"
      >
        <header className="flex items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Historique des échanges</p>
            <h2 id={`history-${prospectId}`} className="truncate text-lg font-semibold text-foreground">
              {company}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-border bg-muted text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">Fermer l&apos;historique</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {!history && failed && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Historique indisponible. Nouvel essai dans 30 s.
            </p>
          )}
          {!history && !failed && (
            <ul aria-busy="true" className="flex flex-col gap-3">
              {[0, 1].map((index) => (
                <li key={index} aria-hidden className={`flex ${index % 2 ? "justify-start" : "justify-end"}`}>
                  <div className="h-20 w-3/4 animate-pulse rounded-2xl bg-muted" />
                </li>
              ))}
            </ul>
          )}
          {history?.messages.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Aucun échange enregistré pour ce prospect.
            </p>
          )}
          {history && history.messages.length > 0 && (
            <ol className="flex flex-col gap-3">
              {history.messages.map((message) => (
                <MessageBubble key={message.id} message={message} company={company} />
              ))}
            </ol>
          )}
        </div>

        <p className="border-t border-border p-4 text-xs text-muted-foreground">
          Vos emails à droite, ses réponses à gauche. Les emails envoyés avant la messagerie (registre du prospecteur)
          n&apos;y figurent pas.
          {failed && history && <span className="text-warning"> Actualisation en échec.</span>}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <MessageSquare aria-hidden className="size-4" />
        Historique
      </button>
      {open && createPortal(drawer, document.body)}
    </>
  );
}

// Bulle de conversation : à droite pour un email envoyé par le Hub, à gauche pour une réponse.
function MessageBubble({ message, company }: { message: MessageRecord; company: string }) {
  const outbound = message.direction === OUTBOUND;
  return (
    <li className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <article
        className={`flex min-w-0 max-w-[85%] flex-col gap-1 rounded-2xl border p-3 ${
          outbound ? "rounded-br-sm border-primary/30 bg-primary/10" : "rounded-bl-sm border-border bg-muted"
        }`}
      >
        <p className={`truncate text-xs font-medium ${outbound ? "text-primary" : "text-muted-foreground"}`}>
          {outbound ? "Securium Agency" : company} · {dateFormat.format(new Date(message.createdAt))}
        </p>
        <h3 className="break-words text-sm font-semibold text-foreground">{message.subject}</h3>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{message.body}</p>
      </article>
    </li>
  );
}
