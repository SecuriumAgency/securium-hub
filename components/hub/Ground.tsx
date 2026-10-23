"use client";

import { Edges, Grid } from "@react-three/drei";

export function Ground() {
  return (
    <group>
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[18, 0.6, 16]} />
        <meshStandardMaterial color="#0b1222" roughness={0.9} />
        <Edges color="#38bdf8" lineWidth={1.5} transparent opacity={0.4} />
      </mesh>
      <Grid
        position={[0, 0.002, 0]}
        args={[18, 16]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e3a5f"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#0e7490"
        fadeStrength={0}
      />
    </group>
  );
}
