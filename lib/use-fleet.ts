import { useEffect, useState } from "react";
import { startPolling } from "./poll";
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

// Flotte hydratée par /api/fleet (statuts Vercel), rafraîchie toutes les 30 s.
export function useFleet() {
  const [sites, setSites] = useState(initialSites);

  useEffect(
    () =>
      startPolling<{ sites: Site[] }>("/api/fleet", POLL_INTERVAL_MS, ({ sites: next }) =>
        setSites((previous) => mergeSites(previous, next)),
      ),
    [],
  );

  return sites;
}
