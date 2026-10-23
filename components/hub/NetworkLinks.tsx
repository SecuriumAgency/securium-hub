"use client";

import { memo, useMemo, useRef, type ComponentRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Site } from "@/lib/sites";
import { siteAccent } from "./models";

export const LINK_HEIGHT = 0.09;

// Liaisons QG → sites : pointillés qui défilent si le site est en ligne, figés sinon
// (rouges hors ligne, gris si le statut est inconnu).
export function NetworkLinks({ sites }: { sites: Site[] }) {
  const headquarters = sites.find((site) => site.kind === "hq");
  if (!headquarters) return null;

  return (
    <group>
      {sites
        .filter((site) => site.kind !== "hq")
        .map((site) => (
          <Link key={site.id} hub={headquarters.coords} site={site} />
        ))}
    </group>
  );
}

// drei <Line> reconstruit sa géométrie dès que la référence de `points` change : on la mémoïse
// sur les coordonnées pour qu'un changement de statut ne touche que la couleur du matériau.
const Link = memo(function Link({ hub, site }: { hub: Site["coords"]; site: Site }) {
  const line = useRef<ComponentRef<typeof Line>>(null);
  const online = site.status === "online";
  const [hx, , hz] = hub;
  const [x, , z] = site.coords;
  const points = useMemo<[number, number, number][]>(
    () => [
      [hx, LINK_HEIGHT, hz],
      [x, LINK_HEIGHT, z],
    ],
    [hx, hz, x, z],
  );

  useFrame((_, delta) => {
    if (line.current && online) line.current.material.dashOffset -= delta * 0.8;
  });

  return (
    <Line
      ref={line}
      points={points}
      color={siteAccent(site)}
      lineWidth={1.5}
      dashed
      dashSize={0.3}
      gapSize={0.2}
      transparent
      opacity={online ? 0.75 : 0.35}
    />
  );
});
