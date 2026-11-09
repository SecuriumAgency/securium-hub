"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { GRID_MAP } from "../hubGrid";
import Taxi from "../assets/Taxi";

// Échelle et décalage vertical du taxi viennent du plan (hubGrid.ts) : les roues doivent toucher la chaussée.
const { lane, from, to, speed, scale, lift } = GRID_MAP.traffic;

// Taxi qui roule le long de la route, dans la voie centrale. Quand il dépasse la limite, il repart de l'autre côté.
export function TrafficController() {
  const ref = useRef<Group>(null);

  useFrame((_, delta) => {
    const car = ref.current;
    if (!car) return;
    car.position.x += delta * speed;
    if (car.position.x > to) car.position.x = from;
  });

  return (
    <group ref={ref} position={[from, lift, lane]} rotation={[0, Math.PI / 2, 0]} scale={scale}>
      <Taxi />
    </group>
  );
}
