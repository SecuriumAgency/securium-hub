"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { FleetHud } from "@/components/hub/FleetHud";
import { Ground } from "@/components/hub/Ground";
import { NetworkLinks } from "@/components/hub/NetworkLinks";
import { SiteNode } from "@/components/hub/SiteNode";
import { SitePanel } from "@/components/hub/SitePanel";
import { useFleet } from "@/lib/use-fleet";

const TARGET: [number, number, number] = [0, 1.5, 0];

function IsometricCamera() {
  const size = useThree((state) => state.size);
  // Cadre la maquette (~24 × 20 unités projetées) quelle que soit la taille de l'écran.
  const zoom = Math.max(Math.min(size.width / 24, size.height / 20), 1);

  return (
    <OrthographicCamera
      makeDefault
      position={[TARGET[0] + 20, TARGET[1] + 20, TARGET[2] + 20]}
      zoom={zoom}
      near={0.1}
      far={200}
    />
  );
}

export default function Home() {
  const sites = useFleet();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSite = sites.find((site) => site.id === selectedId);
  // Conteneur des overlays drei <Html>. Sans portal, drei vise d'abord le parent du <canvas>
  // puis, une fois les événements R3F connectés, un autre élément : chaque <Html> est alors
  // démonté et recréé à chaud, et une étiquette se perd. Cette ref est remplie avant le rendu
  // du Canvas (drei la type non nullable, d'où le cast).
  const overlay = useRef<HTMLElement>(null) as RefObject<HTMLElement>;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main ref={overlay} className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
      {/* Le Canvas reste monté en permanence (ni rendu conditionnel ni key) : un rafraîchissement
          de la flotte ne recrée jamais le contexte WebGL, R3F se contente de réconcilier la scène. */}
      <Canvas shadows="percentage" dpr={[1, 2]} onPointerMissed={() => setSelectedId(null)}>
        <color attach="background" args={["#05070d"]} />
        <IsometricCamera />
        <OrbitControls
          makeDefault
          target={TARGET}
          minZoom={10}
          maxZoom={160}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.6}
        />

        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#38bdf8", "#020617", 0.6]} />
        <directionalLight
          castShadow
          position={[8, 16, 6]}
          intensity={1.6}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />

        <Ground />
        <NetworkLinks sites={sites} />
        {sites.map((site) => (
          <SiteNode
            key={site.id}
            site={site}
            selected={site.id === selectedId}
            onSelect={setSelectedId}
            portal={overlay}
          />
        ))}
        <SitePanel site={selectedSite} onClose={() => setSelectedId(null)} portal={overlay} />
      </Canvas>

      <FleetHud sites={sites} />
    </main>
  );
}
