"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { GRID_MAP } from "../hubGrid";
import Taxi from "../assets/Taxi";

const { lane, from, to, speed } = GRID_MAP.traffic;
// Le taxi est mis à l'échelle 0,6 : sa carrosserie tient dans la chaussée (largeur 1).
// Sa base est relevée de 0,18 pour que les roues touchent le sol.
const SCALE = 0.6;
const LIFT = 0.18;

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
    <group ref={ref} position={[from, LIFT, lane]} rotation={[0, Math.PI / 2, 0]} scale={SCALE}>
      <Taxi />
    </group>
  );
}
