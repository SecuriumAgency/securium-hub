import { useEffect, useSyncExternalStore } from "react";
import { startPolling } from "./poll";
import { telemetrySignals, type TelemetryResponse, type TelemetrySignals } from "./telemetry";

const POLL_INTERVAL_MS = 10_000;

// `data` : null tant que /api/telemetry n'a jamais répondu. `failed` : la dernière actualisation
// a échoué ; `data` garde alors la dernière réponse reçue, et les signaux 3D les derniers connus.
export type TelemetryState = { data: TelemetryResponse | null; failed: boolean };

// Store hors React, comme celui des leads : une actualisation ne re-rend que ses abonnés (panneau
// Agents, effets 3D du QG), jamais Home ni l'arbre R3F du <Canvas>.
let state: TelemetryState = { data: null, failed: false };
const serverSignals: TelemetrySignals = { hqAlert: false, feedActive: false };
let signals = serverSignals;
const listeners = new Set<() => void>();

function setState(next: TelemetryState) {
  state = next;
  if (next.data) {
    const derived = telemetrySignals(next.data);
    // Référence inchangée tant qu'aucun signal ne bascule : les effets 3D ne se re-rendent pas.
    if (derived.hqAlert !== signals.hqAlert || derived.feedActive !== signals.feedActive) signals = derived;
  }
  listeners.forEach((listener) => listener());
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

const serverState: TelemetryState = { data: null, failed: false };

// À appeler une seule fois (dans Home) : alimente le store depuis /api/telemetry toutes les 10 s.
export function useTelemetryPolling() {
  useEffect(
    () => startPolling<TelemetryResponse>("/api/telemetry", POLL_INTERVAL_MS, (data) => setState({ data, failed: false }), fail),
    [],
  );
}

export function useTelemetry() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  );
}

export function useTelemetrySignals() {
  return useSyncExternalStore(
    subscribe,
    () => signals,
    () => serverSignals,
  );
}
