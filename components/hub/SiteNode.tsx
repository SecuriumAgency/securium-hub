"use client";

import { memo, useRef, useState, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, useCursor } from "@react-three/drei";
import { MathUtils, type Group, type Mesh, type MeshBasicMaterial, type RingGeometry } from "three";
import { Crown } from "lucide-react";
import type { Site, SiteStatus } from "@/lib/sites";
import { FeedPulse } from "./FeedPulse";
import { BuildingModel, HeadquartersModel, palette, siteAccent, siteHeight } from "./models";

// Onde au pied du QG : PULSE_COUNT anneaux décalés, chacun passe de 1× à (1 + PULSE_GROWTH)× son
// rayon en PULSE_PERIOD secondes en s'estompant.
const PULSE_COUNT = 2;
const PULSE_PERIOD = 3.2;
const PULSE_GROWTH = 1.3;
const PULSE_OPACITY = 0.7;

const statusDot: Record<SiteStatus, string> = {
  online: "bg-emerald-400",
  offline: "bg-rose-400",
  unknown: "bg-slate-400",
};

type SiteNodeProps = {
  site: Site;
  selected: boolean;
  onSelect: (id: string) => void;
  portal: RefObject<HTMLElement>;
};

// Mémoïsé : à chaque rafraîchissement de la flotte, seuls les bâtiments dont le site a changé
// se re-rendent (useFleet conserve la référence des sites inchangés, onSelect et portal sont stables).
export const SiteNode = memo(function SiteNode({ site, selected, onSelect, portal }: SiteNodeProps) {
  const [hovered, setHovered] = useState(false);
  const lift = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const pulses = useRef<Group>(null);
  const elapsed = useRef(0);
  useCursor(hovered);

  const isHq = site.kind === "hq";
  const accent = siteAccent(site);
  const plot = isHq ? 4 : 2.4;
  const active = hovered || selected;

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (lift.current) {
      lift.current.position.y = MathUtils.damp(lift.current.position.y, active ? 0.25 : 0, 8, delta);
    }
    if (ring.current) {
      ring.current.scale.setScalar(1 + Math.sin(elapsed.current * 3) * 0.06);
    }
    pulses.current?.children.forEach((child, index) => {
      const pulse = child as Mesh<RingGeometry, MeshBasicMaterial>;
      const phase = (elapsed.current / PULSE_PERIOD + index / PULSE_COUNT) % 1;
      pulse.scale.setScalar(1 + (1 - (1 - phase) ** 2) * PULSE_GROWTH);
      pulse.material.opacity = PULSE_OPACITY * (1 - phase);
    });
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(site.id);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  };

  return (
    <group position={site.coords} name={site.id}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[plot, 0.08, plot]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
        <Edges color={accent} lineWidth={1} transparent opacity={active ? 0.9 : 0.3} />
      </mesh>

      {isHq && <FeedPulse plot={plot} />}

      {isHq && (
        <group ref={pulses} name="hq-pulse">
          {Array.from({ length: PULSE_COUNT }, (_, index) => (
            <mesh key={index} position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.9, 2.02, 96]} />
              <meshBasicMaterial color={palette.hq} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}

      {selected && (
        <mesh ref={ring} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[plot * 0.62, plot * 0.68, 64]} />
          <meshBasicMaterial color={accent} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}

      <group
        ref={lift}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={() => setHovered(false)}
      >
        {isHq ? <HeadquartersModel site={site} active={active} /> : <BuildingModel site={site} active={active} />}
      </group>

      {/* Html reste monté : drei démonte sa racine React de façon synchrone, on évite donc
          de le faire depuis un clic dans cette même racine. Seul le contenu varie. */}
      <Html position={[0, siteHeight(site) + 0.9, 0]} portal={portal} center zIndexRange={[40, 0]}>
        {!selected && (
          <button
            type="button"
            onClick={() => onSelect(site.id)}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-100 shadow-lg shadow-black/40 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-slate-900/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            {isHq ? (
              <Crown aria-hidden className="size-3 text-amber-300" />
            ) : (
              <span aria-hidden className={`size-1.5 rounded-full ${statusDot[site.status]}`} />
            )}
            {site.name}
          </button>
        )}
      </Html>
    </group>
  );
});
