"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { BufferAttribute, CircleGeometry, Color, MeshStandardMaterial, PlaneGeometry, type BufferGeometry, type Group } from "three";
import { ROAD_LINKS, distanceToSegment, roadEnds } from "@/lib/matrix/roads";
import { MATRIX_SITES, MATRIX_TOOLS, type Vec3 } from "@/lib/matrix/tools";

// Lumière du jour : le soleil de Sky est aussi la source de la lumière directionnelle de la scène.
export const SUN: Vec3 = [12, 18, 8];
export const LAKE_CENTER: Vec3 = [17, 0, 13];
const LAKE_RADIUS = 4.5;
const GROUND_SIZE = 80;
const GROUND_SEGMENTS = 96;
const TREE_COUNT = 34;

const ROAD = new MeshStandardMaterial({ color: "#475569", roughness: 0.9 });
const TRUNK = new MeshStandardMaterial({ color: "#92400e", roughness: 0.9 });
const LEAVES_ROUND = new MeshStandardMaterial({ color: "#22c55e", roughness: 0.85, flatShading: true });
const LEAVES_CONE = new MeshStandardMaterial({ color: "#15803d", roughness: 0.85, flatShading: true });
const SAND = new MeshStandardMaterial({ color: "#fde68a", roughness: 0.9 });

// Sol organique : légères ondulations et teintes d'herbe variées, calculées une seule fois.
function createGround(): BufferGeometry {
  const geometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const dark = new Color("#4ade80");
  const light = new Color("#a3e635");
  const color = new Color();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, 0.05 * Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27 - 0.4) + 0.03 * Math.sin((x + z) * 0.8));
    const tone = 0.5 + 0.5 * Math.sin(x * 0.45) * Math.cos(z * 0.38);
    color.copy(dark).lerp(light, tone);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Lac : surface bleue dont les vagues bougent à chaque image, bordée d'une plage.
function Lake({ center, radius }: { center: Vec3; radius: number }) {
  const geometry = useMemo(() => new CircleGeometry(radius, 48), [radius]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: "#38bdf8", roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88 }),
    [],
  );

  useFrame(({ clock }) => {
    const position = geometry.attributes.position;
    const time = clock.elapsedTime;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      position.setZ(index, 0.025 * Math.sin(x * 1.5 + time * 1.3) * Math.cos(y * 1.2 + time * 0.9));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group position={center}>
      <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow />
      <mesh material={SAND} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <ringGeometry args={[radius, radius + 0.7, 48]} />
      </mesh>
    </group>
  );
}

// Routes gris foncé, du bord d'un bâtiment au bord du suivant.
function Roads() {
  const segments = useMemo(
    () => ROAD_LINKS.flatMap(([from, to]) => {
      const ends = roadEnds(from, to);
      return ends ? [ends] : [];
    }),
    [],
  );
  return (
    <group>
      {segments.map(([from, to], index) => {
        const dx = to[0] - from[0];
        const dz = to[2] - from[2];
        return (
          <mesh
            key={index}
            material={ROAD}
            position={[(from[0] + to[0]) / 2, 0.03, (from[2] + to[2]) / 2]}
            rotation={[0, Math.atan2(dx, dz), 0]}
            receiveShadow
          >
            <boxGeometry args={[0.9, 0.04, Math.hypot(dx, dz)]} />
          </mesh>
        );
      })}
    </group>
  );
}

// Générateur déterministe : la forêt est la même à chaque affichage.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type TreeSpot = { x: number; z: number; round: boolean; scale: number };

// Arbres placés hors des bâtiments, des routes et du lac.
function treeSpots(): TreeSpot[] {
  const random = mulberry32(42);
  const roads = ROAD_LINKS.flatMap(([from, to]) => {
    const ends = roadEnds(from, to);
    return ends ? [ends] : [];
  });
  const anchors: Vec3[] = [...MATRIX_TOOLS.map((tool) => tool.position), ...MATRIX_SITES.map((site) => site.position)];
  const spots: TreeSpot[] = [];
  for (let attempt = 0; attempt < 2000 && spots.length < TREE_COUNT; attempt++) {
    const x = (random() * 2 - 1) * GROUND_SIZE * 0.42;
    const z = (random() * 2 - 1) * GROUND_SIZE * 0.42;
    if (Math.hypot(x - LAKE_CENTER[0], z - LAKE_CENTER[2]) < LAKE_RADIUS + 1.5) continue;
    if (anchors.some(([ax, , az]) => Math.hypot(x - ax, z - az) < 3.2)) continue;
    if (roads.some(([from, to]) => distanceToSegment(x, z, from, to) < 1.3)) continue;
    if (spots.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 1.8)) continue;
    spots.push({ x, z, round: random() > 0.5, scale: 0.8 + random() * 0.5 });
  }
  return spots;
}

function Tree({ x, z, round, scale }: TreeSpot) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh material={TRUNK} position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.11, 0.7, 6]} />
      </mesh>
      {round ? (
        <mesh material={LEAVES_ROUND} position={[0, 1.0, 0]} castShadow>
          <sphereGeometry args={[0.55, 8, 6]} />
        </mesh>
      ) : (
        <mesh material={LEAVES_CONE} position={[0, 1.05, 0]} castShadow>
          <coneGeometry args={[0.55, 1.25, 7]} />
        </mesh>
      )}
    </group>
  );
}

// Animaux : petites bêtes qui trottinent en rond dans l'herbe.
const CRITTERS: { anchor: Vec3; color: string; seed: number }[] = [
  { anchor: [-20, 0, -6], color: "#a16207", seed: 0 },
  { anchor: [18, 0, -8], color: "#f5f5f4", seed: 1.7 },
  { anchor: [-22, 0, 10], color: "#78350f", seed: 3.1 },
  { anchor: [22, 0, 4], color: "#f5f5f4", seed: 4.4 },
  { anchor: [-6, 0, 16], color: "#a16207", seed: 2.2 },
  { anchor: [6, 0, 17], color: "#78350f", seed: 5.5 },
];

function Critter({ anchor, color, seed }: { anchor: Vec3; color: string; seed: number }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const element = group.current;
    if (!element) return;
    const time = clock.elapsedTime * 0.6 + seed;
    element.position.set(anchor[0] + Math.cos(time) * 1.6, 0.13 + Math.abs(Math.sin(time * 5)) * 0.06, anchor[2] + Math.sin(time) * 1.6);
    element.rotation.y = -time + Math.PI / 2;
  });
  return (
    <group ref={group}>
      <mesh castShadow>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0.13, 0.06, 0]} castShadow>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

// Décor du village : ciel de jour, sol organique, lac animé, routes, arbres et animaux.
export function Village() {
  const ground = useMemo(() => createGround(), []);
  const trees = useMemo(() => treeSpots(), []);
  return (
    <group>
      <Sky distance={450000} sunPosition={SUN} inclination={0.5} azimuth={0.25} turbidity={3} rayleigh={0.6} />
      <mesh geometry={ground} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <Lake center={LAKE_CENTER} radius={LAKE_RADIUS} />
      <Roads />
      {trees.map((tree, index) => (
        <Tree key={index} {...tree} />
      ))}
      {CRITTERS.map((critter) => (
        <Critter key={critter.seed} {...critter} />
      ))}
    </group>
  );
}
