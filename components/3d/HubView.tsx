"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Box, RotateCcw } from "lucide-react";
import { HubLoader } from "@/components/ui/HubLoader";
import { buildingLabel, useHubClock, useHubStore, useNetworkStatus, type SiteStatus } from "@/store/useHubStore";

// Le moteur 3D (three, React Three Fiber, drei, ≈295 kB gzip) n'est chargé qu'au clic sur « Charger le Hub 3D ».
// Tant que la scène est inactive, la page ne charge que le placeholder : aucun script 3D ne bloque le fil principal.
const HubScene = dynamic(() => import("./HubScene").then((module) => module.HubScene), {
  ssr: false,
  loading: () => <HubLoader />,
});

// Barre latérale NOC : chargée avec la scène, jamais avant le clic.
const NocSidebar = dynamic(() => import("@/components/hub/NocSidebar").then((module) => module.NocSidebar), {
  ssr: false,
});

const GLASS = "rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1 text-xs backdrop-blur-md";

// Pastille et libellé par statut de site, pour l'infobulle.
const STATUS_DOT: Record<SiteStatus, string> = { online: "bg-green-500", maintenance: "bg-amber-500", offline: "bg-red-500" };
const STATUS_LABEL: Record<SiteStatus, string> = { online: "En ligne", maintenance: "Maintenance", offline: "Hors ligne" };

// Écart entre le curseur et l'infobulle, en pixels.
const TOOLTIP_OFFSET = 16;

// Position d'un axe : décalée du curseur ; basculée de l'autre côté si elle déborderait ; bornée au conteneur.
// Calcul pur, sans lecture ni écriture du DOM.
function axisPosition(cursor: number, container: number, size: number): number {
  let position = cursor + TOOLTIP_OFFSET;
  if (position + size > container) position = cursor - TOOLTIP_OFFSET - size;
  return Math.max(0, Math.min(position, container - size));
}

// Suit le curseur sans state React : le pointermove ne fait que noter les coordonnées, et l'infobulle reçoit sa
// position au plus une fois par image, par écriture directe de son transform.
function useTooltipFollower(containerRef: RefObject<HTMLDivElement | null>, tooltipRef: RefObject<HTMLDivElement | null>, active: boolean) {
  const pointer = useRef({ clientX: 0, clientY: 0, frame: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const state = pointer.current;

    const place = () => {
      state.frame = 0;
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const rect = container.getBoundingClientRect();
      const left = axisPosition(state.clientX - rect.left, container.clientWidth, tooltip.offsetWidth);
      const top = axisPosition(state.clientY - rect.top, container.clientHeight, tooltip.offsetHeight);
      tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };
    const schedule = () => {
      if (!state.frame) state.frame = requestAnimationFrame(place);
    };
    const onPointerMove = (event: PointerEvent) => {
      state.clientX = event.clientX;
      state.clientY = event.clientY;
      schedule();
    };

    container.addEventListener("pointermove", onPointerMove);
    // Au passage sur un bâtiment, l'infobulle est placée tout de suite, sans attendre la prochaine image.
    if (active) place();
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    };
  }, [containerRef, tooltipRef, active]);
}

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

// Couche d'interface au-dessus de la scène : barre latérale NOC, infobulle, aide, heure et statut. Elle ne reçoit
// pas les événements de souris (pointer-events-none) : le glisser pour faire tourner la ville passe à travers elle.
// Montée seulement avec la scène, pour qu'aucune mise à jour ne tourne tant que la 3D n'est pas chargée.
function HubOverlays({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  useHubClock();
  useNetworkStatus();
  const now = useLocalClock();
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const systemStatus = useHubStore((state) => state.systemStatus);
  const activeNode = useHubStore((state) => state.activeNode);
  const site = useHubStore((state) => state.sitesNetwork.find((item) => item.id === state.activeNode));
  const isLoading = useHubStore((state) => state.isLoading);
  const hasError = useHubStore((state) => state.hasError);
  const resetView = useHubStore((state) => state.resetView);
  const label = buildingLabel(activeNode);
  const online = systemStatus === "online";
  const tooltipRef = useRef<HTMLDivElement>(null);
  useTooltipFollower(containerRef, tooltipRef, Boolean(label));

  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full">
      <NocSidebar />

      <div className="absolute right-4 top-4">
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/80 px-4 text-xs text-slate-200 backdrop-blur-md transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Vue globale
        </button>
      </div>

      {label && (
        <div
          ref={tooltipRef}
          aria-live="polite"
          className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap"
        >
          <span className={`${GLASS} flex items-center gap-2 text-slate-100`}>
            {site ? (
              <>
                <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[site.status]}`} />
                <span className="font-medium">{site.name}</span>
                <span className="text-slate-400">{STATUS_LABEL[site.status]}</span>
                <span className="text-slate-400">
                  {site.activeVisitors === null ? "Visiteurs non disponibles" : `${site.activeVisitors} visiteurs actifs`}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">{label}</span>
                <span className="text-slate-500">Statut indisponible</span>
              </>
            )}
          </span>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-4 left-[21rem] z-10 text-xs text-slate-400">
        Clic gauche: Tourner | Clic droit: Déplacer | Molette: Zoom
      </p>

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        <span className={`${GLASS} flex items-center gap-2 text-slate-200`}>
          <span aria-hidden className={`size-2 rounded-full ${online ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
          {online ? "Système actif · réseau multi-sites en ligne" : "Maintenance du réseau"}
        </span>
        {isLoading && <span className={`${GLASS} text-slate-400`}>Chargement du réseau…</span>}
        {hasError && <span className={`${GLASS} text-amber-300`}>Réseau injoignable · statuts en maintenance</span>}
        <span className={`${GLASS} text-slate-300`}>
          {now
            ? `${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${timeOfDay === "jour" ? "Jour" : "Nuit"}`
            : "--:--:-- · …"}
        </span>
        <span className="text-[11px] text-slate-500">Securium City Hub v1.0</span>
      </div>
    </div>
  );
}

export function HubView({ hdri = false }: { hdri?: boolean }) {
  const [is3DActive, setIs3DActive] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950">
      {is3DActive ? (
        // touch-none : sur mobile, le glissement fait tourner la ville sans déclencher le scroll ni le pull-to-refresh.
        <div ref={sceneRef} className="absolute inset-0 touch-none">
          {/* Le Canvas R3F se pose en absolu : sans cela, il occupe le flux et repousse la couche d'interface. */}
          <div className="absolute inset-0 z-0">
            <HubScene hdri={hdri} />
          </div>
          <HubOverlays containerRef={sceneRef} />
        </div>
      ) : (
        <>
          <Placeholder onActivate={() => setIs3DActive(true)} />
          <div className="pointer-events-none absolute left-4 top-4 z-10">
            <span className={`${GLASS} text-slate-200`}>Securium Hub 3D - Live Preview</span>
          </div>
        </>
      )}
    </div>
  );
}
