import { useEffect, useSyncExternalStore } from "react";
import type { LeadsResponse } from "./leads";
import { startPolling } from "./poll";

const POLL_INTERVAL_MS = 60_000;

// Store hors React : une mise à jour des leads ne re-rend que ses abonnés (HUD, panneau ouvert),
// jamais Home ni l'arbre R3F du <Canvas>.
let snapshot: LeadsResponse | null = null;
const listeners = new Set<() => void>();

function publish(next: LeadsResponse) {
  if (snapshot && JSON.stringify(snapshot.metrics) === JSON.stringify(next.metrics)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// À appeler une seule fois (dans Home) : alimente le store depuis /api/leads toutes les 60 s.
export function useLeadsPolling() {
  useEffect(() => startPolling<LeadsResponse>("/api/leads", POLL_INTERVAL_MS, publish), []);
}

// `null` tant que /api/leads n'a pas répondu.
export function useLeads() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}
