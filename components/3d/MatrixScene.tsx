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
import { DataFlows, TrafficOrbits } from "./DataFlows";
import { GlobalLogStream } from "./GlobalLogStream";
import { MatrixHud } from "./MatrixHud";
import { MatrixNode } from "./MatrixNode";
import { Npcs } from "./Npcs";
import { SUN, Village } from "./Village";
import { Traffic } from "./Traffic";

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

// Scène « Village vivant » : outils et sites clients en bâtiments, dans un village de jour avec routes,
// véhicules, PNJ et flux de données.
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
    <div ref={overlay} className="relative h-dvh w-full overflow-hidden bg-sky-200">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [18, 22, 26], fov: 36, near: 0.1, far: 300 }}
        onPointerMissed={() => select(null)}
      >
        <fog attach="fog" args={["#dbeafe", 60, 150]} />

        <ambientLight intensity={0.5} />
        <hemisphereLight args={["#bae6fd", "#4ade80", 0.7]} />
        <directionalLight
          castShadow
          position={SUN}
          intensity={1.6}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-24}
          shadow-camera-right={24}
          shadow-camera-top={24}
          shadow-camera-bottom={-24}
        />
        {/* La lumière centrale s'intensifie avec le nombre de tâches attribuées par l'Orchestrateur. */}
        <pointLight position={[0, 4, 0]} color="#fde68a" intensity={0.4 + Math.min(pendingTotal, 8) * 0.12} distance={26} />

        <Village />
        <Traffic />
        <Npcs />
        <DataFlows />
        <TrafficOrbits />
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
            shape="house"
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
