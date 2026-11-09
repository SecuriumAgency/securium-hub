"use client";

import { useEffect, useRef } from "react";
import type { EcosystemMetrics } from "@/lib/matrix/metrics";
import { startPolling } from "@/lib/poll";
import { useMatrixStore, type PendingTask } from "@/store/useMatrixStore";

const POLL_INTERVAL_MS = 15_000;
const METRICS_INTERVAL_MS = 30_000;

// Moteur headless : interroge les tâches de l'Orchestrateur et les métriques réelles, met à jour le store et
// laisse le store décider des réparations. Les alertes déjà présentes au chargement de la page sont journalisées
// sans relancer de réparation : un simple rechargement ne doit pas redéclencher les workflows.
export function useAutomationEngine() {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    useMatrixStore.getState().log("info", null, "Moteur d'automatisation démarré : tâches toutes les 15 s, métriques toutes les 30 s.");

    const stopTasks = startPolling<{ tasks: PendingTask[] }>(
      "/api/tasks/pending",
      POLL_INTERVAL_MS,
      ({ tasks }) => {
        const state = useMatrixStore.getState();
        state.setPending(tasks);

        const fresh = tasks.filter((task) => !seen.current.has(task.id));
        for (const task of fresh) seen.current.add(task.id);

        if (!primed.current) {
          primed.current = true;
          const waiting = fresh.filter((task) => task.severity !== "info").length;
          if (waiting > 0) {
            state.log("warning", null, `${waiting} alerte(s) déjà en attente au chargement : action manuelle, pas de relance automatique.`);
          }
          return;
        }

        for (const task of fresh) {
          if (task.severity !== "info") state.onAlertDetected(task);
        }
      },
      () => useMatrixStore.getState().log("warning", null, "Lecture des tâches impossible : nouvelle tentative au prochain cycle."),
    );

    const stopMetrics = startPolling<EcosystemMetrics>(
      "/api/ecosystem/metrics",
      METRICS_INTERVAL_MS,
      (metrics) => useMatrixStore.getState().setMetrics(metrics),
      () => useMatrixStore.getState().failMetrics(),
    );

    return () => {
      stopTasks();
      stopMetrics();
    };
  }, []);
}
