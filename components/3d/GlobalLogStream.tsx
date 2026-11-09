"use client";

import { useEffect, useRef } from "react";
import { useMatrixStore, type LogLevel } from "@/store/useMatrixStore";

const LEVEL_TONE: Record<LogLevel, string> = {
  info: "text-slate-300",
  success: "text-emerald-300",
  warning: "text-amber-300",
  error: "text-rose-300",
};

const VISIBLE = 8;

// Terminal en bas à gauche : le journal de l'Orchestrateur et des agents, en direct.
export function GlobalLogStream() {
  const logs = useMatrixStore((state) => state.logs);
  const list = useRef<HTMLOListElement>(null);
  const recent = logs.slice(-VISIBLE);

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs.length]);

  return (
    <section
      aria-label="Journal des automatisations"
      className="absolute bottom-4 left-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-emerald-500/20 bg-black/70 p-3 font-mono text-[11px] backdrop-blur-md"
    >
      <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-emerald-400/80">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
        Securium OS · flux en direct
      </p>
      <ol ref={list} role="log" aria-live="polite" className="flex max-h-36 flex-col gap-1 overflow-y-auto">
        {recent.length === 0 && <li className="text-slate-500">En attente d&apos;événements…</li>}
        {recent.map((entry) => (
          <li key={entry.id} className={`leading-snug ${LEVEL_TONE[entry.level]}`}>
            <span className="text-slate-500">
              [{new Date(entry.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}]
            </span>{" "}
            {entry.message}
          </li>
        ))}
      </ol>
    </section>
  );
}
