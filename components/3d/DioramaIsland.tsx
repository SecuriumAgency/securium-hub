"use client";

import { RoundedBox } from "@react-three/drei";
import { GRID_MAP } from "./hubGrid";

const { width, depth, thickness } = GRID_MAP.socle;

// Socle du diorama : une plaque ardoise aux arêtes adoucies. Sa face supérieure est à y = 0, au niveau du sol du diorama.
// Elle arrête le sol infini et sert de surface de réception aux ombres.
export function DioramaIsland() {
  return (
    <RoundedBox args={[width, thickness, depth]} radius={0.1} smoothness={4} position={[0, -thickness / 2, 0]} receiveShadow castShadow>
      <meshStandardMaterial color="#1e293b" roughness={0.4} />
    </RoundedBox>
  );
}
