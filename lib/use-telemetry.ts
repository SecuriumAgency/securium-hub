import { useEffect, useState } from "react";
import { startPolling } from "./poll";
import type { TelemetryResponse } from "./telemetry";

const POLL_INTERVAL_MS = 10_000;

// `data` : null tant que /api/telemetry n'a jamais répondu. `failed` : la dernière actualisation
// a échoué ; `data` garde alors la dernière réponse reçue.
export function useTelemetry() {
  const [state, setState] = useState<{ data: TelemetryResponse | null; failed: boolean }>({ data: null, failed: false });

  useEffect(
    () =>
      startPolling<TelemetryResponse>(
        "/api/telemetry",
        POLL_INTERVAL_MS,
        (data) => setState({ data, failed: false }),
        () => setState((previous) => (previous.failed ? previous : { ...previous, failed: true })),
      ),
    [],
  );

  return state;
}
