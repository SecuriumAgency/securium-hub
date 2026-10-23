import { useEffect, useSyncExternalStore } from "react";
import type { LeadsResponse } from "./leads";
import { startPolling } from "./poll";

const POLL_INTERVAL_MS = 20_000;

// `data` : null tant que /api/leads n'a jamais répondu. `failed` : la dernière actualisation a
// échoué ; `data` garde alors la dernière réponse reçue.
export type LeadsState = { data: LeadsResponse | null; failed: boolean };

// Store hors React : une mise à jour des leads ne re-rend que ses abonnés (HUD, panneau ouvert),
// jamais Home ni l'arbre R3F du <Canvas>.
let state: LeadsState = { data: null, failed: false };
let dataKey = "";
const listeners = new Set<() => void>();

function setState(next: LeadsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function publish(next: LeadsResponse) {
  // Réponse identique à la précédente, horodatage mis à part : aucun rendu.
  const key = JSON.stringify([next.monthStart, next.metrics, next.leads]);
  if (key === dataKey && !state.failed) return;
  dataKey = key;
  setState({ data: next, failed: false });
}

function fail() {
  if (!state.failed) setState({ ...state, failed: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverState: LeadsState = { data: null, failed: false };

// À appeler une seule fois (dans Home) : alimente le store depuis /api/leads toutes les 20 s.
export function useLeadsPolling() {
  useEffect(() => startPolling<LeadsResponse>("/api/leads", POLL_INTERVAL_MS, publish, fail), []);
}

export function useLeads() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  );
}
