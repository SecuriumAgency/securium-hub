"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, MeshStandardMaterial, Vector3, type Group } from "three";
import { TRAFFIC_LOOPS, loopWaypoints } from "@/lib/matrix/roads";
import { useMatrixStore } from "@/store/useMatrixStore";

const GLASS = new MeshStandardMaterial({ color: "#1e293b", roughness: 0.2, metalness: 0.3 });
const WHEEL = new MeshStandardMaterial({ color: "#111827", roughness: 0.9 });

// Véhicules : quatre voitures qui tournent en boucle sur les routes. Elles roulent plus vite quand il y a
// davantage de tâches en attente chez l'Orchestrateur.
const CARS: { loop: number; offset: number; speed: number; color: string }[] = [
  { loop: 0, offset: 0, speed: 0.035, color: "#f87171" },
  { loop: 0, offset: 0.5, speed: 0.03, color: "#60a5fa" },
  { loop: 1, offset: 0, speed: 0.04, color: "#facc15" },
  { loop: 2, offset: 0.3, speed: 0.032, color: "#a78bfa" },
];

function Vehicle({ curve, offset, speed, color }: { curve: CatmullRomCurve3; offset: number; speed: number; color: string }) {
  const group = useRef<Group>(null);
  const progress = useRef(offset);
  const point = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  const paint = useMemo(() => new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }), [color]);

  useFrame((_, delta) => {
    const element = group.current;
    if (!element) return;
    const { pendingTotal } = useMatrixStore.getState();
    progress.current = (progress.current + delta * speed * (1 + Math.min(pendingTotal, 5) * 0.15)) % 1;
    curve.getPointAt(progress.current, point);
    curve.getTangentAt(progress.current, tangent);
    element.position.set(point.x, 0, point.z);
    element.rotation.y = Math.atan2(tangent.x, tangent.z);
  });

  return (
    <group ref={group}>
      <mesh material={paint} position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.32, 0.22, 0.6]} />
      </mesh>
      <mesh material={GLASS} position={[0, 0.36, -0.05]}>
        <boxGeometry args={[0.28, 0.16, 0.3]} />
      </mesh>
      {[-0.18, 0.18].map((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}-${z}`} material={WHEEL} position={[x, 0.09, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, 0.06, 10]} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Traffic() {
  const curves = useMemo(
    () =>
      TRAFFIC_LOOPS.map((ids) => new CatmullRomCurve3(loopWaypoints(ids).map(([x, y, z]) => new Vector3(x, y, z)), true, "catmullrom", 0.5)),
    [],
  );
  return (
    <group>
      {CARS.map((car, index) => (
        <Vehicle key={index} curve={curves[car.loop]} offset={car.offset} speed={car.speed} color={car.color} />
      ))}
    </group>
  );
}
