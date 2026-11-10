"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ServiceState } from "@/lib/coreToolState";

// Store des outils du Securium Core : outil actif, états de service par bâtiment, et cache partagé des routes de données.
// Une route n'est interrogée qu'une fois à la fois, quel que soit le nombre de composants qui l'affichent. Les requêtes
// suspendues quand l'onglet est masqué, et annulées quand plus personne n'écoute.

export type ResourceStatus = "idle" | "loading" | "ready" | "error";
export type Resource = { status: ResourceStatus; data: unknown; updatedAt: string | null };

type CoreToolsState = {
  // Identifiant de l'outil désigné (bâtiment de la ville ou ligne de la liste). Null : vue d'ensemble.
  activeTool: string | null;
  setActiveTool: (id: string | null) => void;
  // État de service par nœud de la ville, publié par la barre latérale à partir des stores existants.
  states: Record<string, ServiceState>;
  setStates: (next: Record<string, ServiceState>) => void;
  // Ressources interrogées, par URL.
  resources: Record<string, Resource>;
  subscribe: (url: string, intervalMs: number) => () => void;
};

// Bookkeeping hors état React : pas de re-rendu à chaque requête.
type Session = { count: number; timer?: ReturnType<typeof setInterval>; controller?: AbortController };
const sessions = new Map<string, Session>();

const EMPTY: Resource = { status: "idle", data: null, updatedAt: null };

export const useCoreToolsStore = create<CoreToolsState>()((set, get) => {
  const patch = (url: string, next: Partial<Resource>) =>
    set((state) => ({ resources: { ...state.resources, [url]: { ...(state.resources[url] ?? EMPTY), ...next } } }));

  // Une requête à la fois par URL : si une est en vol, on n'en lance pas une seconde. Onglet masqué : rien.
  const fetchOnce = (url: string) => {
    const session = sessions.get(url);
    if (!session || session.controller) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const controller = new AbortController();
    session.controller = controller;
    const current = get().resources[url]?.status;
    patch(url, { status: current === "ready" ? "ready" : "loading" });

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 && typeof window !== "undefined") {
          window.location.assign("/login");
          return;
        }
        if (!response.ok) throw new Error(`statut ${response.status}`);
        const data: unknown = await response.json();
        patch(url, { status: "ready", data, updatedAt: new Date().toISOString() });
      })
      .catch(() => {
        // Aucune donnée n'est effacée : l'interface garde la dernière réponse reçue, avec l'erreur signalée.
        if (!controller.signal.aborted) patch(url, { status: "error" });
      })
      .finally(() => {
        if (session.controller === controller) session.controller = undefined;
      });
  };

  return {
    activeTool: null,
    setActiveTool: (activeTool) => set({ activeTool }),
    states: {},
    setStates: (next) => {
      // Mise à jour seulement si une valeur change : la ville ne se redessine pas pour rien.
      const current = get().states;
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(current).length && keys.every((key) => current[key] === next[key]);
      if (!same) set({ states: next });
    },
    resources: {},
    subscribe: (url, intervalMs) => {
      const session = sessions.get(url) ?? { count: 0 };
      sessions.set(url, session);
      session.count += 1;
      if (session.count === 1) {
        fetchOnce(url);
        session.timer = setInterval(() => fetchOnce(url), intervalMs);
      }
      return () => {
        session.count -= 1;
        if (session.count > 0) return;
        clearInterval(session.timer);
        session.controller?.abort();
        sessions.delete(url);
        patch(url, { status: "idle" });
      };
    },
  };
});

// Ressource partagée : abonnement tant que le composant est monté. Retourne null tant que rien n'a été reçu.
export function useCoreResource(url: string, intervalMs: number): Resource | null {
  useEffect(() => useCoreToolsStore.getState().subscribe(url, intervalMs), [url, intervalMs]);
  return useCoreToolsStore((state) => state.resources[url] ?? null);
}
