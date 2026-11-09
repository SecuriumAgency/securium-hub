import { useEffect, useState } from "react";
import { startPolling } from "./poll";

const POLL_INTERVAL_MS = 30_000;

type PendingTask = { site: string; severity: "info" | "warning" | "critical" };

/** Sites ayant au moins une tâche en attente de l'Orchestrateur, hors simple information. */
export function alertSiteIds(tasks: PendingTask[]) {
  return new Set(tasks.filter((task) => task.severity !== "info").map((task) => task.site));
}

// Même contenu : on garde l'ensemble précédent, pour ne pas re-rendre la scène à chaque interrogation.
function sameSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

// Tâches en attente (GET /api/tasks/pending, session admin), rafraîchies toutes les 30 s.
// Un site qui a une tâche non informative passe en orange dans la scène 3D.
export function useAgentAlerts() {
  const [alerts, setAlerts] = useState<Set<string>>(() => new Set());

  useEffect(
    () =>
      startPolling<{ tasks: PendingTask[] }>("/api/tasks/pending", POLL_INTERVAL_MS, ({ tasks }) => {
        const next = alertSiteIds(tasks);
        setAlerts((previous) => (sameSet(previous, next) ? previous : next));
      }),
    [],
  );

  return alerts;
}
