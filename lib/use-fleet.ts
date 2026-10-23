import { useEffect, useState } from "react";
import { initialSites, type Site } from "./sites";

const POLL_INTERVAL_MS = 30_000;

// Conserve la référence de chaque site inchangé : les nœuds 3D mémoïsés ne se re-rendent que si
// leur site a changé, et une réponse identique renvoie `previous` tel quel, donc aucun rendu.
function mergeSites(previous: Site[], next: Site[]) {
  let changed = previous.length !== next.length;
  const merged = next.map((site) => {
    const known = previous.find((candidate) => candidate.id === site.id);
    if (known && JSON.stringify(known) === JSON.stringify(site)) return known;
    changed = true;
    return site;
  });
  return changed ? merged : previous;
}

// Flotte hydratée par /api/fleet, rafraîchie toutes les 30 s tant que l'onglet est visible.
// En cas d'échec, le dernier état connu est conservé.
export function useFleet() {
  const [sites, setSites] = useState(initialSites);

  useEffect(() => {
    let controller: AbortController | undefined;

    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/fleet", { cache: "no-store", signal: current.signal });
        if (!response.ok) {
          console.warn(`[fleet] /api/fleet ${response.status} :`, await response.text());
          return;
        }
        const { sites: next } = (await response.json()) as { sites: Site[] };
        setSites((previous) => mergeSites(previous, next));
      } catch (error) {
        if (!current.signal.aborted) console.warn("[fleet]", error);
      }
    };

    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      controller?.abort();
    };
  }, []);

  return sites;
}
