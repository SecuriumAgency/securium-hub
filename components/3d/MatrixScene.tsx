"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { Building2 } from "lucide-react";
import { useAutomationEngine } from "@/lib/matrix/use-automation-engine";
import { MATRIX_SITES, MATRIX_TOOLS, nodePosition } from "@/lib/matrix/tools";
import { formatNumber } from "@/lib/sites";
import { useFleet } from "@/lib/use-fleet";
import { useMatrixStore } from "@/store/useMatrixStore";
import { CityGrid } from "./CityGrid";
import { DataFlows } from "./DataFlows";
import { GlobalLogStream } from "./GlobalLogStream";
import { MatrixHud } from "./MatrixHud";
import { MatrixNode } from "./MatrixNode";

const OVERVIEW_TARGET = new Vector3(0, 0, -1);
const OVERVIEW_CAMERA = new Vector3(18, 22, 26);
const FOCUS_OFFSET = new Vector3(4.2, 4.2, 6.2);

type OrbitLike = { target: Vector3; update: () => void };

// Vol de caméra : interpole la cible des contrôles et la position vers le bâtiment sélectionné, ou vers la vue globale.
function CameraRig() {
  const selectedId = useMatrixStore((state) => state.selectedId);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitLike | null;
  const goalTarget = useRef(OVERVIEW_TARGET.clone());
  const goalCamera = useRef(OVERVIEW_CAMERA.clone());

  useEffect(() => {
    const position = selectedId ? nodePosition(selectedId) : null;
    if (position) {
      const target = new Vector3(position[0], 1.2, position[2]);
      goalTarget.current.copy(target);
      goalCamera.current.copy(target).add(FOCUS_OFFSET);
    } else {
      goalTarget.current.copy(OVERVIEW_TARGET);
      goalCamera.current.copy(OVERVIEW_CAMERA);
    }
  }, [selectedId]);

  useFrame((_, delta) => {
    if (!controls) return;
    const k = 1 - Math.exp(-delta * 3.5);
    controls.target.lerp(goalTarget.current, k);
    camera.position.lerp(goalCamera.current, k);
    controls.update();
  });

  return null;
}

// Scène « God Mode » : 18 outils et les sites clients en bâtiments, reliés par des flux de données.
export function MatrixScene() {
  const overlay = useRef<HTMLDivElement>(null);
  const sites = useFleet();
  const setFleet = useMatrixStore((state) => state.setFleet);
  const select = useMatrixStore((state) => state.select);
  const selectedId = useMatrixStore((state) => state.selectedId);
  const pendingTotal = useMatrixStore((state) => state.pendingTotal);
  useAutomationEngine();

  useEffect(() => {
    setFleet(sites);
  }, [sites, setFleet]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [select]);

  // Conteneur des étiquettes drei <Html> : même technique que la scène Hub 3D, pour éviter leur remontage.
  const portal = overlay as RefObject<HTMLElement>;

  return (
    <div ref={overlay} className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [18, 22, 26], fov: 36, near: 0.1, far: 200 }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={["#05070d"]} />
        <fog attach="fog" args={["#05070d", 45, 110]} />

        <ambientLight intensity={0.4} />
        <hemisphereLight args={["#38bdf8", "#020617", 0.6]} />
        <directionalLight
          castShadow
          position={[10, 20, 8]}
          intensity={1.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
        />
        {/* La lumière centrale s'intensifie avec le nombre de tâches attribuées par l'Orchestrateur. */}
        <pointLight position={[0, 4, 0]} color="#22d3ee" intensity={0.8 + Math.min(pendingTotal, 8) * 0.25} distance={28} />

        <CityGrid />
        <DataFlows />
        <CameraRig />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          target={[0, 0, -1]}
          minDistance={8}
          maxDistance={70}
          maxPolarAngle={Math.PI / 2.1}
        />

        {MATRIX_TOOLS.map((tool) => (
          <MatrixNode
            key={tool.id}
            id={tool.id}
            label={tool.label}
            shape={tool.shape}
            accent={tool.color}
            position={tool.position}
            icon={tool.icon}
            selected={selectedId === tool.id}
            onSelect={select}
            portal={portal}
          />
        ))}

        {MATRIX_SITES.map((site) => (
          <MatrixNode
            key={site.id}
            id={site.id}
            label={site.label}
            shape="cabin"
            accent="#34d399"
            position={site.position}
            scale={0.85}
            icon={Building2}
            detail={`trafic réf. ${formatNumber(site.traffic)}`}
            selected={selectedId === site.id}
            onSelect={select}
            portal={portal}
          />
        ))}
      </Canvas>

      <nav aria-label="Navigation de la scène" className="absolute left-4 top-4 z-50 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/command"
          className="flex min-h-11 items-center rounded-lg border border-white/10 bg-slate-900/60 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300 backdrop-blur-xl transition-colors hover:border-cyan-300/40 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          Securium Core
        </Link>
        <button
          type="button"
          onClick={() => select(null)}
          className="flex min-h-11 cursor-pointer items-center rounded-lg border border-white/10 bg-slate-900/60 px-3 text-xs font-medium text-slate-200 backdrop-blur-xl transition-colors hover:border-cyan-300/40 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          Vue Globale 360°
        </button>
      </nav>

      <MatrixHud />
      <GlobalLogStream />
    </div>
  );
}
