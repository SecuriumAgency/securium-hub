// Interroge `url` toutes les `intervalMs` tant que l'onglet est visible, et dès qu'il le redevient.
// En cas d'échec, `onData` n'est pas appelé : l'appelant garde son dernier état connu.
// Renvoie la fonction d'arrêt, à rendre telle quelle depuis un useEffect.
export function startPolling<T>(url: string, intervalMs: number, onData: (data: T) => void) {
  let controller: AbortController | undefined;

  const refresh = async () => {
    if (document.visibilityState === "hidden") return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    try {
      const response = await fetch(url, { cache: "no-store", signal: current.signal });
      if (!response.ok) {
        console.warn(`[poll] ${url} ${response.status} :`, await response.text());
        return;
      }
      onData((await response.json()) as T);
    } catch (error) {
      if (!current.signal.aborted) console.warn(`[poll] ${url}`, error);
    }
  };

  refresh();
  const timer = window.setInterval(refresh, intervalMs);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
    controller?.abort();
  };
}
