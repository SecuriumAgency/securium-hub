"use client";

import { MeshStandardMaterial } from "three";
import type { Shape } from "@/lib/matrix/tools";

// Couleur des murs par type de bâtiment. Le statut (vert, orange, rouge) s'ajoute en lumière d'émission, côté MatrixNode.
export const WALL_COLOR: Record<Shape, string> = {
  hospital: "#f8fafc",
  gym: "#fdba74",
  mosque: "#fef3c7",
  hotel: "#fbcfe8",
  house: "#fff7ed",
};

// Matériaux partagés entre les bâtiments : une seule instance chacun.
const roof = new MeshStandardMaterial({ color: "#b45309", roughness: 0.8 });
const red = new MeshStandardMaterial({ color: "#dc2626", roughness: 0.6 });
const glass = new MeshStandardMaterial({ color: "#bae6fd", roughness: 0.15, metalness: 0.1, emissive: "#38bdf8", emissiveIntensity: 0.2 });
const wood = new MeshStandardMaterial({ color: "#78350f", roughness: 0.9 });
const metal = new MeshStandardMaterial({ color: "#94a3b8", roughness: 0.4, metalness: 0.5 });
const dark = new MeshStandardMaterial({ color: "#1f2937", roughness: 0.6 });
const gold = new MeshStandardMaterial({ color: "#eab308", roughness: 0.3, metalness: 0.6 });
const bush = new MeshStandardMaterial({ color: "#16a34a", roughness: 0.9, flatShading: true });

type BuildingProps = { shape: Shape; wall: MeshStandardMaterial };

// Bâtiments low-poly composés de primitives. `wall` porte la couleur et le statut ; le reste est partagé.
export function Building({ shape, wall }: BuildingProps) {
  switch (shape) {
    case "hospital":
      return (
        <group>
          <mesh material={wall} position={[0, 0.7, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.8, 1.4, 1.4]} />
          </mesh>
          <mesh material={metal} position={[0, 1.45, 0]} castShadow>
            <boxGeometry args={[1.95, 0.12, 1.55]} />
          </mesh>
          {/* Croix rouge sur la façade. */}
          <mesh material={red} position={[0, 1.0, 0.715]}>
            <boxGeometry args={[0.9, 0.24, 0.04]} />
          </mesh>
          <mesh material={red} position={[0, 1.0, 0.715]}>
            <boxGeometry args={[0.24, 0.9, 0.04]} />
          </mesh>
          <mesh material={dark} position={[0, 0.3, 0.715]}>
            <boxGeometry args={[0.4, 0.6, 0.04]} />
          </mesh>
        </group>
      );
    case "gym":
      return (
        <group>
          <mesh material={wall} position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 1.1, 1.6]} />
          </mesh>
          <mesh material={metal} position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[2.75, 0.1, 1.75]} />
          </mesh>
          {/* Baies vitrées sur la façade. */}
          {[-0.85, 0, 0.85].map((x) => (
            <mesh key={x} material={glass} position={[x, 0.6, 0.805]}>
              <planeGeometry args={[0.6, 0.7]} />
            </mesh>
          ))}
          {/* Haltère posé devant le bâtiment. */}
          <group position={[1.75, 0.12, 1.2]}>
            <mesh material={dark} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
            </mesh>
            <mesh material={dark} position={[-0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 12]} />
            </mesh>
            <mesh material={dark} position={[0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 12]} />
            </mesh>
          </group>
        </group>
      );
    case "mosque":
      return (
        <group>
          <mesh material={wall} position={[0, 0.25, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 0.5, 2.2]} />
          </mesh>
          <mesh material={wall} position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.85, 0.95, 0.5, 20]} />
          </mesh>
          <mesh material={gold} position={[0, 1.0, 0]} castShadow>
            <sphereGeometry args={[0.85, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={gold} position={[0, 1.9, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
          </mesh>
          {/* Deux minarets aux angles avant. */}
          {[-1.35, 1.35].map((x) => (
            <group key={x} position={[x, 0, 1.35]}>
              <mesh material={wall} position={[0, 1.1, 0]} castShadow>
                <cylinderGeometry args={[0.14, 0.18, 2.2, 12]} />
              </mesh>
              <mesh material={gold} position={[0, 2.35, 0]}>
                <coneGeometry args={[0.2, 0.5, 12]} />
              </mesh>
            </group>
          ))}
          <mesh material={dark} position={[0, 0.3, 1.11]}>
            <boxGeometry args={[0.4, 0.4, 0.04]} />
          </mesh>
        </group>
      );
    case "hotel":
      return (
        <group>
          <mesh material={wall} position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.5, 1.5]} />
          </mesh>
          {/* Toit en pente : deux pans inclinés qui se rejoignent au faîte. */}
          <mesh material={roof} position={[0, 1.9, 0.42]} rotation={[0.55, 0, 0]} castShadow>
            <boxGeometry args={[2.3, 0.08, 1.0]} />
          </mesh>
          <mesh material={roof} position={[0, 1.9, -0.42]} rotation={[-0.55, 0, 0]} castShadow>
            <boxGeometry args={[2.3, 0.08, 1.0]} />
          </mesh>
          {/* Balcons et fenêtres sur la façade. */}
          {[0.55, 1.1].map((y) => (
            <mesh key={y} material={wood} position={[0, y, 0.92]}>
              <boxGeometry args={[1.9, 0.06, 0.3]} />
            </mesh>
          ))}
          {[-0.6, 0.6].map((x) => (
            <mesh key={x} material={glass} position={[x, 0.9, 0.76]}>
              <planeGeometry args={[0.45, 0.4]} />
            </mesh>
          ))}
        </group>
      );
    case "house":
      return (
        <group>
          <mesh material={wall} position={[0, 0.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 0.8, 1.0]} />
          </mesh>
          {/* Toit pointu : pyramide à quatre pans. */}
          <mesh material={roof} position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.9, 0.8, 4]} />
          </mesh>
          <mesh material={wood} position={[0, 0.25, 0.51]}>
            <boxGeometry args={[0.22, 0.45, 0.03]} />
          </mesh>
          <mesh material={glass} position={[0.3, 0.55, 0.51]}>
            <planeGeometry args={[0.22, 0.22]} />
          </mesh>
          {/* Jardin : deux buissons devant la maison. */}
          <mesh material={bush} position={[-0.75, 0.15, 0.6]} castShadow>
            <sphereGeometry args={[0.2, 8, 6]} />
          </mesh>
          <mesh material={bush} position={[0.8, 0.15, 0.6]} castShadow>
            <sphereGeometry args={[0.16, 8, 6]} />
          </mesh>
        </group>
      );
  }
}
