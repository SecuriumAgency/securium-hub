"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Box, RotateCcw } from "lucide-react";
import { HubLoader } from "@/components/ui/HubLoader";
import { buildingLabel, useHubClock, useHubStore } from "@/store/useHubStore";

// Le moteur 3D (three, React Three Fiber, drei, ≈295 kB gzip) n'est chargé qu'au clic sur « Charger le Hub 3D ».
// Tant que la scène est inactive, la page ne charge que le placeholder : aucun script 3D ne bloque le fil principal.
const HubScene = dynamic(() => import("./HubScene").then((module) => module.HubScene), {
  ssr: false,
  loading: () => <HubLoader />,
});

const GLASS = "rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1 text-xs backdrop-blur-md";

// Heure locale, mise à jour chaque seconde. Nulle au rendu serveur : pas de décalage à l'hydratation.
function useLocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// Façade : même conteneur, même taille, que la scène soit active ou non. Le clic remplace le placeholder
// par la scène, sans modifier la mise en page (aucun CLS).
function Placeholder({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
      <button
        type="button"
        onClick={onActivate}
        className="flex min-h-11 items-center gap-3 rounded-full border border-slate-600 bg-slate-900/80 px-6 py-3 text-sm font-medium text-slate-100 backdrop-blur-md transition-colors hover:border-cyan-400/60 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <Box aria-hidden className="size-5 text-cyan-300" />
        Charger le Hub 3D Interactif
      </button>
    </div>
  );
}

// Surcouche HTML de la scène active : heure, statut, infobulle du bâtiment survolé, aide et réinitialisation.
// Montée seulement avec la scène, pour qu'aucune mise à jour ne tourne tant que la 3D n'est pas chargée.
function HubOverlays() {
  useHubClock();
  const now = useLocalClock();
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const systemStatus = useHubStore((state) => state.systemStatus);
  const activeNode = useHubStore((state) => state.activeNode);
  const resetView = useHubStore((state) => state.resetView);
  const label = buildingLabel(activeNode);
  const online = systemStatus === "online";

  return (
    <>
      <div className="absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={resetView}
          className="flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/80 px-4 text-xs text-slate-200 backdrop-blur-md transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Vue globale
        </button>
      </div>

      {label && (
        <div aria-live="polite" className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2">
          <span className={`${GLASS} text-slate-100`}>{label}</span>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-4 left-4 z-10 text-xs text-slate-400">
        Clic gauche: Tourner | Clic droit: Déplacer | Molette: Zoom
      </p>

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        <span className={`${GLASS} flex items-center gap-2 text-slate-200`}>
          <span aria-hidden className={`size-2 rounded-full ${online ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
          {online ? "Système actif · réseau multi-sites en ligne" : "Maintenance du réseau"}
        </span>
        <span className={`${GLASS} text-slate-300`}>
          {now
            ? `${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${timeOfDay === "jour" ? "Jour" : "Nuit"}`
            : "--:--:-- · …"}
        </span>
        <span className="text-[11px] text-slate-500">Securium City Hub v1.0</span>
      </div>
    </>
  );
}

export function HubView({ hdri = false }: { hdri?: boolean }) {
  const [is3DActive, setIs3DActive] = useState(false);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-2xl">
      {is3DActive ? (
        <>
          <HubScene hdri={hdri} />
          <HubOverlays />
        </>
      ) : (
        <Placeholder onActivate={() => setIs3DActive(true)} />
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <span className={`${GLASS} text-slate-200`}>Securium Hub 3D - Live Preview</span>
      </div>
    </div>
  );
}
