"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type Group, type Mesh, type MeshBasicMaterial, type RingGeometry } from "three";
import { useTelemetrySignals } from "@/lib/use-telemetry";

// Anneau du flux de télémétrie autour du QG : il respire en cyan tant que le daemon
// securium-fleet-watch tourne sur le poste, et s'éteint en fondu sinon. Un trait net et un halo
// large et pâle, au ras du terrain.
const FEED_COLOR = "#06b6d4";
const FEED_PERIOD = 2.4;
const RING_OPACITY = 0.75;
const GLOW_OPACITY = 0.18;
// Au-dessus du terrain du QG (sommet à 0.08) et de son onde (0.09).
const FEED_Y = 0.095;

// Décor : il ne doit ni capter le survol ni masquer le clic sur le QG.
const noRaycast = () => null;

// `plot` : côté du terrain carré du QG. L'anneau passe juste au-delà de ses coins.
export function FeedPulse({ plot }: { plot: number }) {
  const { feedActive } = useTelemetrySignals();
  const group = useRef<Group>(null);
  const ring = useRef<Mesh<RingGeometry, MeshBasicMaterial>>(null);
  const glow = useRef<Mesh<RingGeometry, MeshBasicMaterial>>(null);
  // De 0 (éteint) à 1 (flux actif), amorti : une bascule fond en une seconde environ.
  const level = useRef(0);
  const radius = plot / Math.SQRT2 + 0.2;

  useFrame(({ clock }, delta) => {
    level.current = MathUtils.damp(level.current, feedActive ? 1 : 0, 2, delta);
    if (group.current) group.current.visible = level.current > 0.001;
    const breath = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((clock.elapsedTime / FEED_PERIOD) * Math.PI * 2));
    if (ring.current) ring.current.material.opacity = RING_OPACITY * level.current * breath;
    if (glow.current) glow.current.material.opacity = GLOW_OPACITY * level.current * breath;
  });

  return (
    <group ref={group} name="telemetry-feed" position={[0, FEED_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ring} raycast={noRaycast}>
        <ringGeometry args={[radius, radius + 0.06, 128]} />
        <meshBasicMaterial color={FEED_COLOR} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={glow} raycast={noRaycast}>
        <ringGeometry args={[radius - 0.25, radius + 0.35, 128]} />
        <meshBasicMaterial color={FEED_COLOR} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
