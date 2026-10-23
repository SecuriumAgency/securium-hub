"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, Object3D, Vector3, type InstancedMesh } from "three";
import type { Site } from "@/lib/sites";
import { LINK_HEIGHT } from "./NetworkLinks";
import { palette } from "./models";

const PACKETS_PER_LINK = 5;
const PACKET_RADIUS = 0.07;
const PACKET_HEIGHT = LINK_HEIGHT + 0.08;
// Vitesse des paquets en unités de scène par seconde.
const PACKET_SPEED = 2.4;
// Remontée du flux quand un site repasse en ligne (constante de MathUtils.damp).
const RAMP_UP = 3;

const dummy = new Object3D();

// Paquets de données QG → satellites en ligne. Un seul InstancedMesh pour toute la flotte, animé
// uniquement en mutant les matrices d'instance dans useFrame : aucun state React, aucun re-rendu.
export const TrafficSystem = memo(function TrafficSystem({ sites }: { sites: Site[] }) {
  const packets = useRef<InstancedMesh>(null);
  // Intensité du flux par route, entre 0 et 1. Mutée seulement dans useFrame.
  const levels = useRef<number[]>([]);

  const routes = useMemo(() => {
    const headquarters = sites.find((site) => site.kind === "hq");
    if (!headquarters) return [];
    const [hx, , hz] = headquarters.coords;
    return sites
      .filter((site) => site.kind !== "hq")
      .map((site) => {
        const from = new Vector3(hx, PACKET_HEIGHT, hz);
        const to = new Vector3(site.coords[0], PACKET_HEIGHT, site.coords[2]);
        return { from, to, length: from.distanceTo(to), online: site.status === "online" };
      });
  }, [sites]);

  useFrame((state, delta) => {
    const mesh = packets.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;

    routes.forEach((route, r) => {
      // Hors ligne ou inconnu : flux coupé net, dès la frame suivante. En ligne : remontée progressive.
      const level = route.online ? MathUtils.damp(levels.current[r] ?? 0, 1, RAMP_UP, delta) : 0;
      levels.current[r] = level;

      for (let p = 0; p < PACKETS_PER_LINK; p++) {
        const progress = ((time * PACKET_SPEED) / route.length + p / PACKETS_PER_LINK) % 1;
        dummy.position.lerpVectors(route.from, route.to, progress);
        // Le paquet grossit en quittant le QG et s'éteint en arrivant au site.
        dummy.scale.setScalar(level * Math.sin(Math.PI * progress));
        dummy.updateMatrix();
        mesh.setMatrixAt(r * PACKETS_PER_LINK + p, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (routes.length === 0) return null;

  return (
    <instancedMesh
      ref={packets}
      name="traffic-packets"
      args={[undefined, undefined, routes.length * PACKETS_PER_LINK]}
      frustumCulled={false}
    >
      <sphereGeometry args={[PACKET_RADIUS, 12, 12]} />
      <meshBasicMaterial color={palette.online} toneMapped={false} />
    </instancedMesh>
  );
});
