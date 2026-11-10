"use client";

import { useMemo } from "react";
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry } from "three";
import { StaticKit, poseMatrix } from "./InstancedKit";
import { COMMERCIALS, COMMERCIAL_MODELS, HOUSES, HOUSE_MODELS, LAMPS, PARASOLS, PEOPLE, PLATES, ROADS, TREES, TREE_MODELS, type Placement } from "./village-layout";
import { WALK_SCALE } from "./urban-simulation";

// Village statique : routes, quartiers, immeubles, parcs, lampadaires, parasols et figurants. Tout est instancié : une
// pièce, un appel de rendu. Échelles : décor et bâtiments à 1, figurants à WALK_SCALE (même facteur que les véhicules).
// Tout pied est à y = 0.
// Les matrices sont calculées une fois, au chargement du module : aucune recomposition au fil des rendus React.
const ROOT = "/models/hub";

const matricesOf = (items: Placement[], scale = 1) => items.map((item) => poseMatrix({ x: item.x, y: 0, z: item.z, rot: item.rot, scale }, new Matrix4()));

const STRAIGHT = matricesOf(ROADS.filter((piece) => piece.kind === "straight").map((piece) => ({ x: piece.x, z: piece.z, rot: piece.rot })));
const CROSS = matricesOf(ROADS.filter((piece) => piece.kind === "cross").map((piece) => ({ x: piece.x, z: piece.z, rot: 0 })));
const ENDS = matricesOf(ROADS.filter((piece) => piece.kind === "end").map((piece) => ({ x: piece.x, z: piece.z, rot: piece.rot })));
const LAMP_MATRICES = matricesOf(LAMPS);

const HOUSE_MATRICES = Object.fromEntries(HOUSE_MODELS.map((model) => [model, matricesOf(HOUSES[model])]));
const COMMERCIAL_MATRICES = Object.fromEntries(COMMERCIAL_MODELS.map((model) => [model, matricesOf(COMMERCIALS[model])]));
const TREE_MATRICES = Object.fromEntries(TREE_MODELS.map((model) => [model, matricesOf(TREES[model])]));
const PARASOL_MATRICES = matricesOf(PARASOLS);
const PERSON_MODELS = ["male-a", "female-a", "male-b", "female-b", "male-c", "female-c"] as const;
const PERSON_MATRICES = Object.fromEntries(PERSON_MODELS.map((model) => [model, matricesOf(PEOPLE.filter((person) => person.model === model), WALK_SCALE)]));

// Parcelles : une plaque colorée par case, sous les bâtiments. Une seule instance pour tout le plan.
function Plates() {
  const mesh = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
    const instanced = new InstancedMesh(geometry, material, PLATES.length);
    const matrix = new Matrix4();
    const color = new Color();
    PLATES.forEach((plate, index) => {
      matrix.makeScale(plate.w, 1, plate.d);
      matrix.setPosition(plate.x, 0.004, plate.z);
      instanced.setMatrixAt(index, matrix);
      instanced.setColorAt(index, color.set(plate.color));
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.receiveShadow = true;
    return instanced;
  }, []);
  return <primitive object={mesh} />;
}

export function CityEnvironment({ night = false }: { night?: boolean }) {
  return (
    <group>
      <Plates />
      <StaticKit url={`${ROOT}/roads/road-straight.glb`} matrices={STRAIGHT} />
      <StaticKit url={`${ROOT}/roads/road-crossroad.glb`} matrices={CROSS} />
      <StaticKit url={`${ROOT}/roads/road-end.glb`} matrices={ENDS} />
      <StaticKit url={`${ROOT}/roads/street-lamp.glb`} matrices={LAMP_MATRICES} />
      {HOUSE_MODELS.map((model) => (
        <StaticKit key={model} url={`${ROOT}/suburban/${model}.glb`} matrices={HOUSE_MATRICES[model]} night={night} />
      ))}
      {COMMERCIAL_MODELS.map((model) => (
        <StaticKit key={model} url={`${ROOT}/commercial/${model}.glb`} matrices={COMMERCIAL_MATRICES[model]} night={night} />
      ))}
      {TREE_MODELS.map((model) => (
        <StaticKit key={model} url={`${ROOT}/suburban/${model}.glb`} matrices={TREE_MATRICES[model]} />
      ))}
      <StaticKit url={`${ROOT}/commercial/parasol.glb`} matrices={PARASOL_MATRICES} />
      {PERSON_MODELS.map((model) => (
        <StaticKit key={model} url={`${ROOT}/characters/character-${model}.glb`} matrices={PERSON_MATRICES[model]} />
      ))}
    </group>
  );
}
