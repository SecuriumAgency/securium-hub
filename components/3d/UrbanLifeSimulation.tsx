"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useHubStore } from "@/store/useHubStore";
import { MovingKit, type Pose } from "./InstancedKit";
import { GRAPH, NOC_NODES, PARKS, PERSON_MODELS } from "./village-layout";

// Ville vivante : véhicules sur le réseau de rues, humains qui marchent sur les trottoirs entre les carrefours,
// animaux qui gambadent dans les parcs. Les états vivent dans des objets de simulation, pas dans l'état React : la
// boucle d'images met à jour des poses, et les ensembles instanciés les recopient dans leurs matrices.
// Échelles : véhicules 0,55, humains 0,45, animaux 0,08. Tout pied est à y = 0.

const CAR_MODELS = ["taxi", "sedan", "van", "suv", "hatchback-sports"] as const;
const PET_MODELS = ["cat", "dog", "bunny", "beaver", "chick", "penguin"] as const;
const CAR_COUNT = 30;
const WALKER_COUNT = 40;
const PET_COUNT = 6;

const CAR_SCALE = 0.55;
const WALK_SCALE = 0.45;
const PET_SCALE = 0.08;
const CAR_LANE = 0.25;
const WALK_LANE = 0.8;
const CAR_SPEED: [number, number] = [1.2, 0.5]; // [jour, nuit]
const WALK_SPEED: [number, number] = [0.8, 0.4];
const PET_SPEED: [number, number] = [0.5, 0.2];

type Agent = { from: string; to: string; t: number; wait: number };

const NO_FORBIDDEN = new Set<string>();
const isNight = () => useHubStore.getState().timeOfDay === "nuit";
const between = (min: number, max: number) => min + Math.random() * (max - min);
const pickOf = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

// Nœuds de l'alerte : ceux des bâtiments dont le site est hors ligne ou en maintenance.
function alertNodes(): Set<string> {
  const alerts = new Set<string>();
  for (const site of useHubStore.getState().sitesNetwork) {
    if (site.status !== "online" && NOC_NODES[site.id]) alerts.add(NOC_NODES[site.id]);
  }
  return alerts;
}

// Voisin suivant : au carrefour, un virage au hasard ; au cul-de-sac, demi-tour. Les nœuds en alerte sont évités.
function chooseNext(node: string, previous: string, forbidden: Set<string>): string | null {
  const allowed = (GRAPH.edges[node] ?? []).filter((next) => !forbidden.has(next));
  const forward = allowed.filter((next) => next !== previous);
  const pool = forward.length ? forward : allowed;
  return pool.length ? pickOf(pool) : null;
}

// Arrivée à un nœud : l'agent repart vers un voisin, et marque parfois une pause (humains).
function arrive(agent: Agent, forbidden: Set<string>, pause: [number, number] | null): boolean {
  const previous = agent.from;
  const node = agent.to;
  agent.from = node;
  agent.t = 0;
  const next = chooseNext(node, previous, forbidden);
  if (next === null) {
    agent.to = node;
    agent.wait = 1;
    return false;
  }
  agent.to = next;
  if (pause && Math.random() < 0.35) agent.wait = between(pause[0], pause[1]);
  return true;
}

// Fait avancer l'agent de `distance` le long du réseau, en changeant de tronçon à chaque nœud atteint.
function advance(agent: Agent, distance: number, forbidden: Set<string>, pause: [number, number] | null) {
  let remaining = distance;
  while (remaining > 0) {
    const a = GRAPH.nodes[agent.from];
    const b = GRAPH.nodes[agent.to];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    const left = (1 - agent.t) * length;
    if (remaining < left) {
      agent.t += remaining / length;
      return;
    }
    remaining -= left;
    if (!arrive(agent, forbidden, pause) || agent.wait > 0) return;
  }
}

// Position sur le tronçon, décalée de `lane` vers la droite du sens de marche. Le modèle regarde vers +z.
function place(agent: Agent, pose: Pose, lane: number) {
  const a = GRAPH.nodes[agent.from];
  const b = GRAPH.nodes[agent.to];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  pose.x = a.x + dx * agent.t - uz * lane;
  pose.z = a.z + dz * agent.t + ux * lane;
  pose.rot = Math.atan2(ux, uz);
}

const NODE_KEYS = Object.keys(GRAPH.nodes);
const startAgent = (): Agent => {
  const from = pickOf(NODE_KEYS);
  const to = pickOf(GRAPH.edges[from]);
  return { from, to, t: Math.random(), wait: 0 };
};

type Simulation = {
  update: (dt: number) => void;
  cars: Record<string, Pose[]>;
  walkers: Record<string, Pose[]>;
  pets: Record<string, Pose[]>;
};

function createSimulation(): Simulation {
  const cars = Array.from({ length: CAR_COUNT }, (_, index) => ({
    model: CAR_MODELS[index % CAR_MODELS.length],
    agent: startAgent(),
    pose: { x: 0, y: 0, z: 0, rot: 0, scale: CAR_SCALE },
  }));
  const walkers = Array.from({ length: WALKER_COUNT }, (_, index) => ({
    model: PERSON_MODELS[index % PERSON_MODELS.length],
    agent: startAgent(),
    pose: { x: 0, y: 0, z: 0, rot: 0, scale: WALK_SCALE },
  }));
  const parkCentres = Array.from({ length: PET_COUNT }, () => pickOf(PARKS));
  const pets = Array.from({ length: PET_COUNT }, (_, index) => {
    const centre = parkCentres[index];
    return {
      model: PET_MODELS[index % PET_MODELS.length],
      centre,
      target: { x: centre[0], z: centre[2] },
      wait: Math.random() * 3,
      pose: { x: centre[0], y: 0, z: centre[2], rot: 0, scale: PET_SCALE },
    };
  });

  for (const car of cars) place(car.agent, car.pose, CAR_LANE);
  for (const walker of walkers) place(walker.agent, walker.pose, WALK_LANE);

  const groupBy = (items: { model: string; pose: Pose }[]) => {
    const groups: Record<string, Pose[]> = {};
    for (const item of items) (groups[item.model] ??= []).push(item.pose);
    return groups;
  };

  return {
    cars: groupBy(cars),
    walkers: groupBy(walkers),
    pets: groupBy(pets),
    update(dt: number) {
      const night = isNight();
      const forbidden = alertNodes();
      for (const car of cars) {
        advance(car.agent, (night ? CAR_SPEED[1] : CAR_SPEED[0]) * dt, NO_FORBIDDEN, null);
        place(car.agent, car.pose, CAR_LANE);
      }
      for (const walker of walkers) {
        if (walker.agent.wait > 0) {
          walker.agent.wait -= dt;
        } else {
          advance(walker.agent, (night ? WALK_SPEED[1] : WALK_SPEED[0]) * dt, forbidden, night ? [3, 6] : [1, 3]);
        }
        place(walker.agent, walker.pose, WALK_LANE);
      }
      for (const pet of pets) {
        if (pet.wait > 0) {
          pet.wait -= dt;
          continue;
        }
        const dx = pet.target.x - pet.pose.x;
        const dz = pet.target.z - pet.pose.z;
        const distance = Math.hypot(dx, dz);
        const step = (night ? PET_SPEED[1] : PET_SPEED[0]) * dt;
        if (distance <= step) {
          pet.pose.x = pet.target.x;
          pet.pose.z = pet.target.z;
          pet.wait = between(2, 5);
          // Nouvelle cible dans le parc, à l'intérieur de la case (loin des rues).
          pet.target = { x: pet.centre[0] + between(-2.5, 2.5), z: pet.centre[2] + between(-2.5, 2.5) };
        } else {
          pet.pose.x += (dx / distance) * step;
          pet.pose.z += (dz / distance) * step;
          pet.pose.rot = Math.atan2(dx, dz);
        }
      }
    },
  };
}

export function UrbanLifeSimulation() {
  const sim = useMemo(() => createSimulation(), []);
  useFrame((_, delta) => sim.update(Math.min(delta, 0.05)));

  return (
    <group>
      {CAR_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/cars/${model}.glb`} poses={sim.cars[model] ?? []} />
      ))}
      {PERSON_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/characters/character-${model}.glb`} poses={sim.walkers[model] ?? []} />
      ))}
      {PET_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/pets/animal-${model}.glb`} poses={sim.pets[model] ?? []} />
      ))}
    </group>
  );
}
