"use client";

import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, useCursor } from "@react-three/drei";
import { Color, MeshBasicMaterial, MeshStandardMaterial, type Group, type Mesh } from "three";
import type { LucideIcon } from "lucide-react";
import type { Shape, Vec3 } from "@/lib/matrix/tools";
import { nodeStatus, useMatrixStore, type NodeStatus } from "@/store/useMatrixStore";

// Couleurs de statut : vert = opérationnel, orange = tâche ou réparation en cours, rouge = erreur.
const STATUS_RGB: Record<NodeStatus, Color> = {
  active: new Color("#34d399"),
  working: new Color("#fb923c"),
  success: new Color("#4ade80"),
  error: new Color("#f43f5e"),
};

type MatrixNodeProps = {
  id: string;
  label: string;
  shape: Shape;
  accent: string;
  position: Vec3;
  scale?: number;
  selected: boolean;
  onSelect: (id: string) => void;
  portal: RefObject<HTMLElement>;
  icon: LucideIcon;
  detail?: string;
};

type StructureProps = { shape: Shape; body: MeshStandardMaterial; spinner: RefObject<Group | null> };

// Bâtiment procédural : la silhouette change selon le rôle (tour, usine, dôme, studio, radar, cabane).
function Structure({ shape, body, spinner }: StructureProps) {
  switch (shape) {
    case "tower":
      return (
        <group>
          <mesh material={body} position={[0, 1.0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 2.0, 1.1]} />
          </mesh>
          <mesh material={body} position={[0, 2.45, 0]} castShadow>
            <boxGeometry args={[0.7, 0.9, 0.7]} />
          </mesh>
          <mesh material={body} position={[0, 3.3, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.1, 6]} />
          </mesh>
        </group>
      );
    case "factory":
      return (
        <group>
          <mesh material={body} position={[-0.4, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.2, 1.2, 1.6]} />
          </mesh>
          <mesh material={body} position={[0.7, 0.45, 0]} castShadow>
            <boxGeometry args={[0.8, 0.9, 1.2]} />
          </mesh>
          <mesh material={body} position={[-0.9, 1.6, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 1.0, 8]} />
          </mesh>
          <mesh material={body} position={[-0.3, 1.5, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 0.8, 8]} />
          </mesh>
        </group>
      );
    case "dome":
      return (
        <group>
          <mesh material={body} position={[0, 0.25, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.0, 1.1, 0.5, 24]} />
          </mesh>
          <mesh material={body} position={[0, 0.5, 0]} castShadow>
            <sphereGeometry args={[1.0, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      );
    case "studio":
      return (
        <group>
          <mesh material={body} position={[0, 0.9, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 1.8, 1.2]} />
          </mesh>
          <mesh position={[0, 1.0, 0.61]}>
            <planeGeometry args={[1.1, 0.8]} />
            <meshBasicMaterial color="#67e8f9" transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </group>
      );
    case "radar":
      return (
        <group>
          <mesh material={body} position={[0, 0.35, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.7, 0.8, 0.7, 12]} />
          </mesh>
          <mesh material={body} position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.8, 6]} />
          </mesh>
          <group ref={spinner} position={[0, 2.3, 0]}>
            <mesh material={body} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.6, 0.06, 8, 24]} />
            </mesh>
          </group>
        </group>
      );
    case "cabin":
      return (
        <group>
          <mesh material={body} position={[0, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 1.2, 1.1]} />
          </mesh>
          <mesh material={body} position={[0, 1.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.0, 0.7, 4]} />
          </mesh>
        </group>
      );
  }
}

// Bâtiment cliquable : statut lumineux, anneau au sol, satellite en orbite (aura), étiquette HTML.
export const MatrixNode = memo(function MatrixNode({
  id,
  label,
  shape,
  accent,
  position,
  scale = 1,
  selected,
  onSelect,
  portal,
  icon: Icon,
  detail,
}: MatrixNodeProps) {
  const status = useMatrixStore((state) => nodeStatus(state, id));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const body = useMemo(
    () => new MeshStandardMaterial({ color: "#0b1220", roughness: 0.35, metalness: 0.4, emissive: STATUS_RGB.active, emissiveIntensity: 0.3 }),
    [],
  );
  const ringMaterial = useMemo(() => new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  const orbitMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  const spinner = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const elapsed = useRef(0);

  useEffect(
    () => () => {
      body.dispose();
      ringMaterial.dispose();
      orbitMaterial.dispose();
    },
    [body, ringMaterial, orbitMaterial],
  );

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;
    const rgb = STATUS_RGB[status];

    // Lumière du bâtiment : pulsation lente au repos, flash en erreur, clignotement en cours de réparation.
    let intensity = 0.3 + (Math.sin(t * 2) + 1) * 0.1;
    if (status === "error") intensity = Math.sin(t * 12) > 0 ? 1.4 : 0.1;
    else if (status === "success") intensity = 1.2 + Math.sin(t * 8) * 0.3;
    else if (status === "working") intensity = 0.7 + Math.sin(t * 5) * 0.35;
    if (selected || hovered) intensity += 0.25;
    body.emissive.copy(rgb);
    body.emissiveIntensity = intensity;

    if (orbit.current) orbit.current.rotation.y += delta * (status === "working" ? 3.2 : status === "error" ? 0 : 0.7);
    orbitMaterial.color.copy(rgb);
    ringMaterial.color.copy(rgb);
    ringMaterial.opacity = selected ? 0.9 : 0.45 + Math.sin(t * 3) * 0.1;
    if (ring.current) ring.current.scale.setScalar(selected ? 1.08 : 1);
    if (spinner.current) spinner.current.rotation.y += delta * (status === "working" ? 3 : 1.2);
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(id);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  };

  return (
    <group position={position} scale={scale} name={id}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.1, 2.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
        <Edges color={accent} lineWidth={1} transparent opacity={selected || hovered ? 0.95 : 0.4} />
      </mesh>

      <mesh ref={ring} position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMaterial}>
        <ringGeometry args={[1.25, 1.36, 48]} />
      </mesh>

      <group ref={orbit} position={[0, 0.1, 0]}>
        <mesh position={[1.7, 0.9, 0]} material={orbitMaterial}>
          <sphereGeometry args={[0.1, 12, 12]} />
        </mesh>
      </group>

      <group onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={() => setHovered(false)}>
        <Structure shape={shape} body={body} spinner={spinner} />
      </group>

      <Html position={[0, 3.9, 0]} portal={portal} center zIndexRange={[40, 0]}>
        <button
          type="button"
          onClick={() => onSelect(id)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-lg shadow-black/40 backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
            selected ? "border-cyan-300/60 bg-slate-900/90 text-white" : "border-white/15 bg-slate-950/65 text-slate-100 hover:border-white/30"
          }`}
        >
          <Icon aria-hidden className="size-3" style={{ color: accent }} />
          {label}
          {(hovered || selected) && detail && <span className="text-slate-400">· {detail}</span>}
        </button>
      </Html>
    </group>
  );
});
