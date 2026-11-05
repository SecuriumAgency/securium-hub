"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveBadge } from "@/components/admin/PageHeader";

// Relit les données de la page à intervalle régulier, sans recharger l'écran (router.refresh).
// Suspendu quand l'onglet est caché. Le compteur « mis à jour il y a N s » démarre à 0 : pas d'écart d'hydratation.
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAgo(0);
    };
    const refreshTimer = window.setInterval(refresh, seconds * 1000);
    const tickTimer = window.setInterval(() => setAgo((value) => value + 1), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(tickTimer);
    };
  }, [router, seconds]);

  return <LiveBadge label={`En direct · mis à jour il y a ${ago} s`} />;
}
