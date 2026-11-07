"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Notification éphémère, en bas à droite. Un succès est annoncé en `status`, une erreur en `alert`.
// Rendue dans <body> : aucun ancêtre avec filtre ou transformation ne peut la déplacer. Disparaît après 4 secondes.
export type ToastState = { kind: "ok" | "error"; text: string };

const DURATION_MS = 4000;

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const isError = toast.kind === "error";
  return createPortal(
    <div
      role={isError ? "alert" : "status"}
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        isError ? "border-red-400/40 bg-red-950 text-red-200" : "border-emerald-400/40 bg-emerald-950 text-emerald-200"
      }`}
    >
      <span className="min-w-0 flex-1">
        {isError ? "❌ " : "✅ "}
        {toast.text}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        <span aria-hidden>×</span>
      </button>
    </div>,
    document.body,
  );
}
