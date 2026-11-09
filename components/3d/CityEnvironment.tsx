"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Vec3 } from "./hubGrid";

// Décor statique de la ville : lampadaires, poteaux électriques et parasols (en lieu d'arbres : les packs téléchargés
// n'en contiennent pas). Modèles Kenney (licence CC0), copiés dans public/models/hub.
// Échelle 1 pour le décor. Tout pied est posé à Y = 0. Aucun re-rendu : chaque modèle est cloné une fois.
const LAMP = "/models/hub/roads/street-lamp.glb";
const POLE = "/models/hub/roads/electricity-pole.glb";
const PARASOL = "/models/hub/commercial/parasol.glb";

type Spot = { x: number; z: number; rotation?: number };

// Trottoirs : lampadaires de part et d'autre de la route (z = ±1), évités les figurants de hubGrid.ts.
const LAMPS: Spot[] = [
  { x: -5, z: -1 },
  { x: -1, z: -1 },
  { x: 5, z: -1 },
  { x: -5, z: 1 },
  { x: 2, z: 1 },
  { x: 6, z: 1 },
];

const POLES: Spot[] = [
  { x: -7, z: -1 },
  { x: 7, z: 1 },
];

// Devant la ville, à l'est du parc des animaux.
const PARASOLS: Spot[] = [
  { x: 2, z: 3 },
  { x: 3, z: 4 },
  { x: 5, z: 3 },
];

useGLTF.preload(LAMP);
useGLTF.preload(POLE);
useGLTF.preload(PARASOL);

function Prop({ url, position, rotation = 0 }: { url: string; position: Vec3; rotation?: number }) {
  const { scene } = useGLTF(url);
  // Une copie par emplacement : le graphe de scène d'un modèle ne peut pas être partagé entre deux parents.
  const copy = useMemo(() => scene.clone(), [scene]);
  return <primitive object={copy} position={position} rotation={[0, rotation, 0]} scale={1} />;
}

function Row({ url, spots }: { url: string; spots: Spot[] }) {
  return (
    <>
      {spots.map((spot) => (
        <Prop key={`${url}-${spot.x}-${spot.z}`} url={url} position={[spot.x, 0, spot.z]} rotation={spot.rotation} />
      ))}
    </>
  );
}

export function CityEnvironment() {
  return (
    <group>
      <Row url={LAMP} spots={LAMPS} />
      <Row url={POLE} spots={POLES} />
      <Row url={PARASOL} spots={PARASOLS} />
    </group>
  );
}
