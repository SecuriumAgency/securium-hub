"use client";

import { useRef, type ComponentProps, type ComponentType } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useHubStore } from "@/store/useHubStore";
import CharacterFemaleA from "./assets/CharacterFemaleA";
import CharacterMaleA from "./assets/CharacterMaleA";
import Sedan from "./assets/Sedan";
import Taxi from "./assets/Taxi";
import { GRID_MAP } from "./hubGrid";

// Ville vivante : véhicules qui suivent le réseau routier et tournent aux carrefours, humains qui marchent entre les
// bâtiments. Tout se joue dans useFrame, sur des refs : aucun état React n'est mis à jour à chaque image.
// Échelles validées : véhicules 0,55, humains 0,45. Tout pied est posé à y = 0.

type GroupProps = ComponentProps<"group">;
type NodeId = "west" | "east" | "center" | "north" | "south";

// Réseau routier : le carrefour central, les deux bouts de l'axe, et les deux culs-de-sac nord et sud.
const { z: roadZ, from, to, cross } = GRID_MAP.roads;
const NODES: Record<NodeId, { x: number; z: number }> = {
  west: { x: from, z: roadZ },
  east: { x: to, z: roadZ },
  center: { x: cross.x, z: roadZ },
  north: { x: cross.x, z: cross.north },
  south: { x: cross.x, z: cross.south },
};

// Voisins de chaque nœud. Un cul-de-sac n'a qu'un voisin : le véhicule y fait demi-tour.
const EDGES: Record<NodeId, NodeId[]> = {
  west: ["center"],
  east: ["center"],
  center: ["west", "east", "north", "south"],
  north: ["center"],
  south: ["center"],
};

// Véhicules : taxis et berline du Car Kit. Ils roulent à droite, à 0,25 de l'axe, et ralentissent la nuit.
const VEHICLE_SCALE = 0.55;
const VEHICLE_SPEED_DAY = 1.2;
const VEHICLE_SPEED_NIGHT = 0.5;
const LANE_OFFSET = 0.25;
const VEHICLES: { Model: ComponentType<GroupProps>; start: NodeId }[] = [
  { Model: Taxi, start: "west" },
  { Model: Sedan, start: "center" },
  { Model: Taxi, start: "east" },
];

// Humains : posés sur les trottoirs, devant les bâtiments. Ils marquent une pause à chaque arrivée, plus longue la nuit.
const WALK_SCALE = 0.45;
const WALK_SPEED_DAY = 0.8;
const WALK_SPEED_NIGHT = 0.4;
const PAUSE_DAY: [number, number] = [1.5, 4];
const PAUSE_NIGHT: [number, number] = [4, 8];

// Portes : points de passage sur les trottoirs. `buildingId` relie la porte à son bâtiment, pour l'alerte.
type Door = { x: number; z: number; buildingId: string | null };
const DOORS: Door[] = [
  { x: -4, z: -1, buildingId: "immeuble-a-rue" },
  { x: -2, z: -1, buildingId: "immeuble-c-rue" },
  { x: 2.1, z: -1, buildingId: GRID_MAP.shopSite.id },
  { x: 5.5, z: -1, buildingId: "immeuble-a-rue-2" },
  { x: -3, z: 1, buildingId: null },
  { x: -1, z: 1, buildingId: null },
  { x: 4, z: 1, buildingId: null },
];
const WALKERS: { Model: ComponentType<GroupProps>; startDoor: number }[] = [
  { Model: CharacterMaleA, startDoor: 0 },
  { Model: CharacterFemaleA, startDoor: 2 },
  { Model: CharacterMaleA, startDoor: 4 },
  { Model: CharacterFemaleA, startDoor: 6 },
];

const isNight = () => useHubStore.getState().timeOfDay === "nuit";
const randomBetween = ([min, max]: [number, number]) => min + Math.random() * (max - min);

// Alerte : un bâtiment dont le site est hors ligne ou en maintenance n'attire plus les humains, et ceux qui s'en
// approchent s'arrêtent sur place. Un bâtiment sans site n'alerte pas.
function isAlert(buildingId: string | null): boolean {
  if (!buildingId) return false;
  const site = useHubStore.getState().sitesNetwork.find((item) => item.id === buildingId);
  return site !== undefined && site.status !== "online";
}

// Nœud suivant : au carrefour, un virage au hasard parmi les autres branches ; au cul-de-sac, demi-tour.
function nextNode(current: NodeId, previous: NodeId | null): NodeId {
  const options = EDGES[current];
  if (options.length === 1) return options[0];
  const others = options.filter((node) => node !== previous);
  return others[Math.floor(Math.random() * others.length)];
}

// Un véhicule parcourt le réseau nœud après nœud. Son état vit dans une ref, mis à jour à chaque image.
function Vehicle({ Model, start }: { Model: ComponentType<GroupProps>; start: NodeId }) {
  const group = useRef<Group>(null);
  const leg = useRef({ from: start, to: nextNode(start, null), t: Math.random() * 0.5 });

  useFrame((_, delta) => {
    const car = group.current;
    if (!car) return;
    const state = leg.current;
    let remaining = (isNight() ? VEHICLE_SPEED_NIGHT : VEHICLE_SPEED_DAY) * delta;

    // Avance la distance de la frame, en changeant de tronçon à chaque nœud atteint.
    while (remaining > 0) {
      const a = NODES[state.from];
      const b = NODES[state.to];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const left = (1 - state.t) * length;
      if (remaining < left) {
        state.t += remaining / length;
        remaining = 0;
      } else {
        remaining -= left;
        const previous = state.from;
        state.from = state.to;
        state.to = nextNode(state.to, previous);
        state.t = 0;
      }
    }

    // Position sur le tronçon, décalée sur la voie de droite. Le modèle regarde vers +z : son cap suit le sens de marche.
    const a = NODES[state.from];
    const b = NODES[state.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    car.position.set(a.x + dx * state.t - uz * LANE_OFFSET, 0, a.z + dz * state.t + ux * LANE_OFFSET);
    car.rotation.y = Math.atan2(ux, uz);
  });

  return (
    <group ref={group} scale={VEHICLE_SCALE}>
      <Model />
    </group>
  );
}

// Choisit la prochaine porte : une autre que la courante, et jamais un bâtiment en alerte. Sans choix possible, le
// humain reste sur place.
function pickDoor(current: Door): Door {
  const candidates = DOORS.filter((door) => door !== current && !isAlert(door.buildingId));
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : current;
}

// Un humain marche en ligne droite d'une porte à l'autre, puis fait une pause. Son état vit dans une ref.
function Walker({ Model, startDoor }: { Model: ComponentType<GroupProps>; startDoor: number }) {
  const group = useRef<Group>(null);
  const start = DOORS[startDoor];
  const walk = useRef({ x: start.x, z: start.z, target: start, pause: Math.random() * 3 });

  useFrame((_, delta) => {
    const person = group.current;
    if (!person) return;
    const state = walk.current;

    if (state.pause > 0) {
      state.pause -= delta;
    } else if (!isAlert(state.target.buildingId)) {
      const dx = state.target.x - state.x;
      const dz = state.target.z - state.z;
      const distance = Math.hypot(dx, dz);
      const step = (isNight() ? WALK_SPEED_NIGHT : WALK_SPEED_DAY) * delta;
      if (distance <= step) {
        state.x = state.target.x;
        state.z = state.target.z;
        state.target = pickDoor(state.target);
        state.pause = randomBetween(isNight() ? PAUSE_NIGHT : PAUSE_DAY);
      } else {
        state.x += (dx / distance) * step;
        state.z += (dz / distance) * step;
        person.rotation.y = Math.atan2(dx, dz);
      }
    }
    // Un bâtiment en alerte est une cible gelée : le humain reste sur place jusqu'au retour à la normale.
    person.position.set(state.x, 0, state.z);
  });

  return (
    <group ref={group} scale={WALK_SCALE}>
      <Model />
    </group>
  );
}

// Entités animées de la ville : véhicules et humains. Montée dans le Canvas, sans état React.
export function UrbanLifeSimulation() {
  return (
    <group>
      {VEHICLES.map((vehicle, index) => (
        <Vehicle key={`vehicle-${index}`} Model={vehicle.Model} start={vehicle.start} />
      ))}
      {WALKERS.map((walker, index) => (
        <Walker key={`walker-${index}`} Model={walker.Model} startDoor={walker.startDoor} />
      ))}
    </group>
  );
}
