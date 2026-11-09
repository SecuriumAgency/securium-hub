"use client";

import { ContactShadows, Grid, Line, MeshReflectorMaterial } from "@react-three/drei";
import { MATRIX_SITES, MATRIX_TOOLS, ZONES } from "@/lib/matrix/tools";

// Sol holographique : plan réfléchissant, grille cyberpunk, plaques de quartiers et canalisations vers la tour.
export function CityGrid() {
  const centralTower = MATRIX_TOOLS.find((tool) => tool.central) ?? MATRIX_TOOLS[0];
  const hub: [number, number, number] = [centralTower.position[0], 0.12, centralTower.position[2]];

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <MeshReflectorMaterial
          blur={[300, 80]}
          resolution={512}
          mixBlur={0.8}
          mixStrength={10}
          roughness={0.9}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#050b16"
          metalness={0.6}
          mirror={0.5}
        />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[70, 70]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#164e63"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#22d3ee"
        fadeDistance={55}
        fadeStrength={1.5}
      />

      {Object.entries(ZONES).map(([zoneId, zone]) => (
        <mesh key={zoneId} rotation={[-Math.PI / 2, 0, 0]} position={[zone.center[0], 0.02, zone.center[2]]}>
          <planeGeometry args={zone.size} />
          <meshBasicMaterial color={zone.color} transparent opacity={0.07} depthWrite={false} />
        </mesh>
      ))}

      {MATRIX_TOOLS.filter((tool) => !tool.central).map((tool) => (
        <Line
          key={tool.id}
          points={[hub, [tool.position[0], 0.12, tool.position[2]]]}
          color={tool.color}
          lineWidth={1}
          transparent
          opacity={0.2}
        />
      ))}
      {MATRIX_SITES.map((site) => (
        <Line key={site.id} points={[hub, [site.position[0], 0.12, site.position[2]]]} color="#34d399" lineWidth={1} transparent opacity={0.25} />
      ))}

      <ContactShadows position={[0, 0.005, 0]} opacity={0.5} scale={40} blur={2.2} far={6} />
    </group>
  );
}
