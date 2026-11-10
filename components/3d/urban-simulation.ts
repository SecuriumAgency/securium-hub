// Simulation de la ville vivante. Module pur : ni React, ni three, ni store. Le monde (nuit, santé PM2, alertes, leads) est
// lu à chaque image par un fournisseur injecté, ce qui permet de la vérifier sans navigateur (scripts de contrôle).
// Véhicules sur le réseau de rues, feux aux carrefours, PNJ sur les trottoirs, animaux dans les parcs, et PNJ « Prospect »
// qui va du bâtiment de prospection au QG à chaque nouveau lead. Échelles : véhicules 0,55, humains 0,45, animaux 0,08.
import type { FleetHealth } from "@/lib/telemetry";
import type { Pose } from "./InstancedKit";
import { HQ_BUILDING_ID, PROSPECT_BUILDING_ID, type Vec3 } from "./hubGrid";
import { GRAPH, NOC_NODES, PARKS, PERSON_MODELS, isSignal, shortestPath, signalState } from "./village-layout";

export const CAR_MODELS = ["taxi", "sedan", "van", "suv", "hatchback-sports"] as const;
export const PET_MODELS = ["cat", "dog", "bunny", "beaver", "chick", "penguin"] as const;
export const CAR_COUNT = 44;
export const WALKER_COUNT = 56;
export const PET_COUNT = 10;

// Échelles mesurées sur les GLB : véhicules de 1,3 à 1,5 unité de large ; une voie fait 0,5. À 0,27, un véhicule fait
// 0,40 de large et reste dans sa voie (marge de 0,05 de part et d'autre du décalage de 0,25). Humains et animaux suivent
// le même facteur (0,27 / 0,55), pour garder les proportions de l'ancienne version.
export const CAR_SCALE = 0.27;
export const WALK_SCALE = 0.22;
export const PET_SCALE = 0.04;
export const CAR_LANE = 0.25;
export const WALK_LANE = 0.8;
const CAR_SPEED: [number, number] = [1.2, 0.5]; // [jour, nuit]
const WALK_SPEED: [number, number] = [0.8, 0.4];
const PET_SPEED: [number, number] = [0.5, 0.2];
const PROSPECT_SPEED = 0.9;
// Ligne d'arrêt à STOP_GAP du carrefour ; écart minimal entre deux véhicules sur un même tronçon.
const STOP_GAP = 0.9;
// Véhicules plus courts (≈ 0,75 unité) : l'écart minimal se réduit en conséquence.
const CAR_GAP = 1.0;
// Pause du PNJ Prospect au QG, avant qu'il reparte.
const TERMINUS_PAUSE = 4;

// Vitesse selon la santé des processus PM2 : un processus en erreur ralentit la ville, un daemon arrêté la fige.
export const HEALTH_SPEED: Record<FleetHealth, number> = { ok: 1, degraded: 0.35, halted: 0 };
const HEALTH_LOG: Record<FleetHealth, { message: string; level: "info" | "warn" | "error" }> = {
  ok: { message: "PM2 : processus nominaux, circulation normale", level: "info" },
  degraded: { message: "PM2 : processus en erreur, circulation ralentie", level: "warn" },
  halted: { message: "PM2 : daemon arrêté, circulation à l'arrêt", level: "error" },
};

// Trajet du PNJ Prospect : du bâtiment de prospection au QG, sur le réseau de rues.
export const PROSPECT_TRIP = shortestPath(NOC_NODES[PROSPECT_BUILDING_ID], NOC_NODES[HQ_BUILDING_ID]);

export type WorldView = {
  night: boolean;
  health: FleetHealth;
  unseenLeads: number;
  // Nœuds évités par les PNJ : ceux des bâtiments dont le site est hors ligne ou en maintenance.
  forbiddenNodes: ReadonlySet<string>;
  log: (message: string, level: "info" | "warn" | "error") => void;
};

// Trajet imposé : les nœuds à suivre, et l'indice du nœud de départ du tronçon en cours.
type Trip = { path: string[]; index: number };
// `prev` : nœud d'où vient l'agent, pour lisser son décalage de voie dans un virage (voir place).
export type Agent = { from: string; to: string; t: number; wait: number; prev?: string; trip?: Trip };
export type Vehicle = { model: string; agent: Agent; pose: Pose };
export type Pet = { model: string; centre: Vec3; target: { x: number; z: number }; wait: number; pose: Pose };
export type Prospect = { agent: Agent; active: boolean; pose: Pose };

export type Simulation = {
  // Temps de simulation, en secondes : cadence les feux.
  readonly time: number;
  update: (dt: number) => void;
  // Poses regroupées par modèle, pour les ensembles instanciés.
  cars: Record<string, Pose[]>;
  walkers: Record<string, Pose[]>;
  pets: Record<string, Pose[]>;
  prospects: Pose[];
  // États internes, exposés pour les contrôles.
  agents: { cars: Vehicle[]; walkers: Vehicle[]; pets: Pet[]; prospect: Prospect };
};

// Limite de progression sur le tronçon, en distance depuis son origine. Renvoie la longueur si rien ne bloque.
type Limit = (agent: Agent, length: number) => number;
const unlimited: Limit = (_agent, length) => length;
const NO_FORBIDDEN: ReadonlySet<string> = new Set<string>();
const NODE_KEYS = Object.keys(GRAPH.nodes);

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pickOf = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

// Voisin suivant : au carrefour, un virage au hasard ; au cul-de-sac, demi-tour. Les nœuds en alerte sont évités.
function chooseNext(node: string, previous: string, forbidden: ReadonlySet<string>): string | null {
  const allowed = (GRAPH.edges[node] ?? []).filter((next) => !forbidden.has(next));
  const forward = allowed.filter((next) => next !== previous);
  const pool = forward.length ? forward : allowed;
  return pool.length ? pickOf(pool) : null;
}

// Passage au tronçon suivant d'un trajet imposé. Au terminus, demi-tour et pause avant de repartir.
function nextLeg(agent: Agent, trip: Trip): boolean {
  trip.index += 1;
  if (trip.index + 1 < trip.path.length) {
    agent.to = trip.path[trip.index + 1];
    return true;
  }
  trip.path.reverse();
  trip.index = 0;
  agent.to = trip.path[1];
  agent.wait = TERMINUS_PAUSE;
  return true;
}

// Arrivée à un nœud : l'agent repart vers un voisin, ou suit son trajet imposé, et marque parfois une pause (humains).
function arrive(agent: Agent, forbidden: ReadonlySet<string>, pause: [number, number] | null): boolean {
  const previous = agent.from;
  const node = agent.to;
  agent.from = node;
  agent.prev = previous;
  agent.t = 0;
  if (agent.trip) return nextLeg(agent, agent.trip);
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

// Fait avancer l'agent de `distance` le long du réseau. Il s'arrête avant un nœud si `limit` le lui impose.
function advance(agent: Agent, distance: number, forbidden: ReadonlySet<string>, pause: [number, number] | null, limit: Limit) {
  let remaining = distance;
  while (remaining > 0) {
    const a = GRAPH.nodes[agent.from];
    const b = GRAPH.nodes[agent.to];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    const position = agent.t * length;
    const stop = Math.max(position, Math.min(length, limit(agent, length)));
    const room = stop - position;
    if (remaining < room) {
      agent.t += remaining / length;
      return;
    }
    remaining -= room;
    agent.t = stop / length;
    // Bloqué avant le bout du tronçon (feu rouge, véhicule devant) : l'agent attend sur place.
    if (stop < length) return;
    if (!arrive(agent, forbidden, pause) || agent.wait > 0) return;
  }
}

// Longueur de la transition de voie à l'entrée d'un tronçon : le décalage passe de l'ancien sens au nouveau sans saut.
const LANE_BLEND = 1.2;

// Position sur le tronçon, décalée de `lane` vers la droite du sens de marche. Le modèle regarde vers +z.
function place(agent: Agent, pose: Pose, lane: number) {
  const a = GRAPH.nodes[agent.from];
  const b = GRAPH.nodes[agent.to];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  let offsetX = -uz * lane;
  let offsetZ = ux * lane;
  // Au début du tronçon, le décalage reprend celui du tronçon précédent (point de jonction continu), puis glisse vers le sien.
  const travelled = agent.t * length;
  if (agent.prev !== undefined && travelled < LANE_BLEND) {
    const p = GRAPH.nodes[agent.prev];
    const px = a.x - p.x;
    const pz = a.z - p.z;
    const previousLength = Math.hypot(px, pz) || 1;
    const previousOffsetX = (-pz / previousLength) * lane;
    const previousOffsetZ = (px / previousLength) * lane;
    const k = travelled / LANE_BLEND;
    offsetX = previousOffsetX + (offsetX - previousOffsetX) * k;
    offsetZ = previousOffsetZ + (offsetZ - previousOffsetZ) * k;
  }
  pose.x = a.x + dx * agent.t + offsetX;
  pose.z = a.z + dz * agent.t + offsetZ;
  pose.rot = Math.atan2(ux, uz);
}

const startAgent = (): Agent => {
  const from = pickOf(NODE_KEYS);
  const to = pickOf(GRAPH.edges[from]);
  return { from, to, t: Math.random(), wait: 0 };
};

const segmentLength = (from: string, to: string) =>
  Math.hypot(GRAPH.nodes[to].x - GRAPH.nodes[from].x, GRAPH.nodes[to].z - GRAPH.nodes[from].z) || 1e-6;

// Feu rouge sur l'axe suivi : ligne d'arrêt. Véhicule qui précède sur le même tronçon et dans le même sens : écart CAR_GAP.
// Véhicule qui vient de franchir le carrefour visé, par une autre branche : on attend qu'il se dégage (écart CAR_GAP).
function carLimit(agent: Agent, length: number, cars: Vehicle[], time: number): number {
  let limit = length;
  const a = GRAPH.nodes[agent.from];
  const b = GRAPH.nodes[agent.to];
  if (isSignal(agent.to) && signalState(agent.to, a.z === b.z ? "h" : "v", time) === "red") limit = length - STOP_GAP;
  let leader = Infinity;
  for (const { agent: other } of cars) {
    if (other === agent) continue;
    if (other.from === agent.from && other.to === agent.to && other.t > agent.t) leader = Math.min(leader, other.t);
    if (other.from === agent.to && other.t * segmentLength(other.from, other.to) < CAR_GAP) limit = Math.min(limit, length - STOP_GAP);
  }
  if (leader !== Infinity) limit = Math.min(limit, leader * length - CAR_GAP);
  return limit;
}

// Le PNJ Prospect repart du bâtiment de prospection, avec un trajet neuf.
function startProspect(prospect: Prospect) {
  prospect.active = true;
  prospect.agent.from = PROSPECT_TRIP[0];
  prospect.agent.to = PROSPECT_TRIP[1];
  prospect.agent.t = 0;
  prospect.agent.wait = 0;
  prospect.agent.trip = { path: [...PROSPECT_TRIP], index: 0 };
}

export function createSimulation(read: () => WorldView): Simulation {
  let clock = 0;
  let lastHealth: FleetHealth = "ok";

  const cars: Vehicle[] = Array.from({ length: CAR_COUNT }, (_, index) => ({
    model: CAR_MODELS[index % CAR_MODELS.length],
    agent: startAgent(),
    pose: { x: 0, y: 0, z: 0, rot: 0, scale: CAR_SCALE },
  }));
  const walkers: Vehicle[] = Array.from({ length: WALKER_COUNT }, (_, index) => ({
    model: PERSON_MODELS[index % PERSON_MODELS.length],
    agent: startAgent(),
    pose: { x: 0, y: 0, z: 0, rot: 0, scale: WALK_SCALE },
  }));
  const pets: Pet[] = Array.from({ length: PET_COUNT }, (_, index) => {
    const centre = pickOf(PARKS);
    return {
      model: PET_MODELS[index % PET_MODELS.length],
      centre,
      target: { x: centre[0], z: centre[2] },
      wait: Math.random() * 3,
      pose: { x: centre[0], y: 0, z: centre[2], rot: 0, scale: PET_SCALE },
    };
  });
  const prospect: Prospect = {
    agent: { from: "", to: "", t: 0, wait: 0 },
    active: false,
    pose: { x: 0, y: 0, z: 0, rot: 0, scale: 0 },
  };

  for (const car of cars) place(car.agent, car.pose, CAR_LANE);
  for (const walker of walkers) place(walker.agent, walker.pose, WALK_LANE);

  const groupBy = (items: { model: string; pose: Pose }[]) => {
    const groups: Record<string, Pose[]> = {};
    for (const item of items) (groups[item.model] ??= []).push(item.pose);
    return groups;
  };

  return {
    get time() {
      return clock;
    },
    cars: groupBy(cars),
    walkers: groupBy(walkers),
    pets: groupBy(pets),
    prospects: [prospect.pose],
    agents: { cars, walkers, pets, prospect },
    update(dt: number) {
      const world = read();
      if (world.health !== lastHealth) {
        lastHealth = world.health;
        world.log(HEALTH_LOG[world.health].message, HEALTH_LOG[world.health].level);
      }
      const speed = HEALTH_SPEED[world.health];
      clock += dt;

      const carLimitNow: Limit = (agent, length) => carLimit(agent, length, cars, clock);
      for (const car of cars) {
        advance(car.agent, (world.night ? CAR_SPEED[1] : CAR_SPEED[0]) * speed * dt, NO_FORBIDDEN, null, carLimitNow);
        place(car.agent, car.pose, CAR_LANE);
      }

      for (const walker of walkers) {
        if (walker.agent.wait > 0) {
          walker.agent.wait -= dt;
        } else {
          advance(
            walker.agent,
            (world.night ? WALK_SPEED[1] : WALK_SPEED[0]) * speed * dt,
            world.forbiddenNodes,
            world.night ? [3, 6] : [1, 3],
            unlimited,
          );
        }
        place(walker.agent, walker.pose, WALK_LANE);
      }

      // PNJ Prospect : présent tant qu'un lead n'a pas été vu, il fait l'aller-retour entre le bâtiment et le QG.
      if (world.unseenLeads > 0 && !prospect.active && PROSPECT_TRIP.length >= 2) startProspect(prospect);
      else if (world.unseenLeads === 0) prospect.active = false;
      if (prospect.active) {
        if (prospect.agent.wait > 0) prospect.agent.wait -= dt;
        else advance(prospect.agent, PROSPECT_SPEED * speed * dt, NO_FORBIDDEN, null, unlimited);
        place(prospect.agent, prospect.pose, WALK_LANE);
        prospect.pose.scale = WALK_SCALE;
      } else {
        prospect.pose.scale = 0;
      }

      for (const pet of pets) {
        if (pet.wait > 0) {
          pet.wait -= dt;
          continue;
        }
        const dx = pet.target.x - pet.pose.x;
        const dz = pet.target.z - pet.pose.z;
        const distance = Math.hypot(dx, dz);
        const step = (world.night ? PET_SPEED[1] : PET_SPEED[0]) * speed * dt;
        if (distance <= step) {
          pet.pose.x = pet.target.x;
          pet.pose.z = pet.target.z;
          pet.wait = between(2, 5);
          // Nouvelle cible dans le parc, à l'intérieur de la case (loin des rues).
          pet.target = { x: pet.centre[0] + between(-2.5, 2.5), z: pet.centre[2] + between(-2.5, 2.5) };
        } else if (step > 0) {
          pet.pose.x += (dx / distance) * step;
          pet.pose.z += (dz / distance) * step;
          pet.pose.rot = Math.atan2(dx, dz);
        }
      }
    },
  };
}
