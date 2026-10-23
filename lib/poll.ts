// Interroge `url` toutes les `intervalMs` tant que l'onglet est visible, et dès qu'il le redevient.
// En cas d'échec, `onData` n'est pas appelé : l'appelant garde son dernier état connu, et `onError`
// est prévenu. Un 401 vient du middleware (session expirée) : retour à /login.
// Renvoie la fonction d'arrêt, à rendre telle quelle depuis un useEffect.
export function startPolling<T>(url: string, intervalMs: number, onData: (data: T) => void, onError?: () => void) {
  let controller: AbortController | undefined;

  const refresh = async () => {
    if (document.visibilityState === "hidden") return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    try {
      const response = await fetch(url, { cache: "no-store", signal: current.signal });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) {
        console.warn(`[poll] ${url} ${response.status} :`, await response.text());
        onError?.();
        return;
      }
      onData((await response.json()) as T);
    } catch (error) {
      if (current.signal.aborted) return;
      console.warn(`[poll] ${url}`, error);
      onError?.();
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
