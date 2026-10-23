import { useEffect, useState } from "react";

// Heure courante, rafraîchie toutes les `intervalMs` : libellés relatifs et badges « Nouveau »
// avancent seuls, sans attendre une nouvelle réponse de l'API.
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

// « à l'instant », « il y a 5 minutes », « il y a 3 heures », « il y a 2 jours ».
export function formatAgo(iso: string, now: number) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (seconds > -60) return "à l'instant";
  if (seconds > -3600) return relative.format(Math.round(seconds / 60), "minute");
  if (seconds > -86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}
