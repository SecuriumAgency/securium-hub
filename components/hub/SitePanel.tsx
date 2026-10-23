"use client";

import { useRef, type ReactNode, type Ref, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { MathUtils, Vector3, type Camera, type Object3D } from "three";
import { Building2, CalendarDays, Crosshair, Crown, Users, X } from "lucide-react";
import { formatNumber, type Site, type SiteStatus } from "@/lib/sites";
import { useLeads } from "@/lib/use-leads";
import { siteHeight } from "./models";

const VIEWPORT_MARGIN = 12;
const anchorWorld = new Vector3();

const statusBadge: Record<SiteStatus, { label: string; badge: string; dot: string }> = {
  online: { label: "En ligne", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
  offline: { label: "Hors ligne", badge: "border-rose-400/30 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
  unknown: { label: "Statut inconnu", badge: "border-slate-400/30 bg-slate-400/10 text-slate-300", dot: "bg-slate-400" },
};

type SitePanelProps = {
  site?: Site;
  onClose: () => void;
  portal: RefObject<HTMLElement>;
};

// Toujours monté, même sans sélection : drei démonte la racine React de <Html> de façon
// synchrone, on évite donc de le faire depuis le bouton Fermer situé dans cette racine.
export function SitePanel({ site, onClose, portal }: SitePanelProps) {
  const card = useRef<HTMLDivElement>(null);
  const anchor: [number, number, number] = site
    ? [site.coords[0], siteHeight(site) + 0.6, site.coords[2]]
    : [0, 0, 0];

  // Le panneau est posé au-dessus du bâtiment (bas-centre sur l'ancre), mais borné à l'écran :
  // sans ça, celui du QG sort par le haut et son bouton Fermer devient inaccessible.
  const keepInViewport = (object: Object3D, camera: Camera, size: { width: number; height: number }) => {
    anchorWorld.setFromMatrixPosition(object.matrixWorld).project(camera);
    const x = (anchorWorld.x * 0.5 + 0.5) * size.width;
    const y = (-anchorWorld.y * 0.5 + 0.5) * size.height;
    const halfWidth = (card.current?.offsetWidth ?? 0) / 2;
    const height = card.current?.offsetHeight ?? 0;
    return [
      MathUtils.clamp(x, halfWidth + VIEWPORT_MARGIN, size.width - halfWidth - VIEWPORT_MARGIN),
      MathUtils.clamp(y, height + VIEWPORT_MARGIN, size.height - VIEWPORT_MARGIN),
    ];
  };

  return (
    <Html position={anchor} portal={portal} zIndexRange={[100, 50]} calculatePosition={keepInViewport}>
      {site && <PanelCard ref={card} site={site} onClose={onClose} />}
    </Html>
  );
}

function PanelCard({ site, onClose, ref }: { site: Site; onClose: () => void; ref: Ref<HTMLDivElement> }) {
  // Abonné au store des leads : seule cette carte se re-rend à chaque rafraîchissement.
  const metrics = useLeads()?.metrics[site.id];
  const [x, y, z] = site.coords;
  const online = site.status === "online";
  const status = statusBadge[site.status];
  const isHq = site.kind === "hq";

  return (
    <div ref={ref} className="-translate-x-1/2 -translate-y-full pb-4">
      <section
        aria-label={`Statistiques de ${site.name}`}
        className="relative w-72 rounded-2xl border border-white/15 bg-slate-900/45 p-4 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <header className="flex items-start gap-3">
          <div
            className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
              isHq
                ? "border-amber-300/30 bg-amber-400/15 text-amber-300"
                : "border-cyan-300/30 bg-cyan-400/10 text-cyan-300"
            }`}
          >
            {isHq ? <Crown aria-hidden className="size-5" /> : <Building2 aria-hidden className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{site.sector}</p>
            <h2 className="truncate text-base font-semibold text-white">{site.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <div
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${status.badge}`}
        >
          <span className="relative flex size-2">
            {online && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex size-2 rounded-full ${status.dot}`} />
          </span>
          {status.label}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Stat
            icon={<CalendarDays aria-hidden className="size-3.5" />}
            label="Leads (mois)"
            value={metrics ? formatNumber(metrics.leadsThisMonth) : "—"}
          />
          <Stat
            icon={<Users aria-hidden className="size-3.5" />}
            label="Leads (total)"
            value={metrics ? formatNumber(metrics.leadsTotal) : "—"}
          />
        </dl>

        <footer className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <Crosshair aria-hidden className="size-3" />
          x {x} · y {y} · z {z}
        </footer>

        <div
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-white/15 bg-slate-900/45"
        />
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <dt className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}
