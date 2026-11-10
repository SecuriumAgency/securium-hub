// Village étendu sur la dalle : grille de rues, quartiers, bâtiments, parcs et réseau de circulation.
// Le plan est déterministe (graine fixe) : le même village à chaque chargement. Unité : une case.
// Le socle central et son carrefour restent ceux de hubGrid.ts ; la grille les prolonge jusqu'à ±64.
import { GRID_MAP, type Vec3 } from "./hubGrid";

export const HALF = 64;

// Rues est-ouest (z) et nord-sud (x). La rue z = 0 est l'axe principal ; x = 0 n'a que les culs-de-sac du socle.
export const H_STREETS = [-64, -56, -48, -40, -32, -24, -16, -8, 0, 8, 16, 24, 32, 40, 48, 56, 64];
export const V_STREETS = [-57, -49, -41, -33, -25, -17, -9, 9, 17, 25, 33, 41, 49, 57];

export type Placement = { x: number; z: number; rot: number };
export type Plate = { x: number; z: number; w: number; d: number; color: string };
export type RoadPiece = { kind: "straight" | "cross" | "end"; x: number; z: number; rot: number };

export const HOUSE_MODELS = ["house-a", "house-c", "house-e", "house-g", "house-k", "house-m", "house-p", "house-s"] as const;
export const COMMERCIAL_MODELS = ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f"] as const;
export const TREE_MODELS = ["tree-large", "tree-small"] as const;
export type HouseModel = (typeof HOUSE_MODELS)[number];
export type CommercialModel = (typeof COMMERCIAL_MODELS)[number];
export type TreeModel = (typeof TREE_MODELS)[number];
export type PersonModel = "male-a" | "female-a" | "male-b" | "female-b" | "male-c" | "female-c";
export const PERSON_MODELS: PersonModel[] = ["male-a", "female-a", "male-b", "female-b", "male-c", "female-c"];

export type Graph = { nodes: Record<string, { x: number; z: number }>; edges: Record<string, string[]> };

// Graine fixe : le même village à chaque chargement.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261109);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const QUARTER_TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

const key = (x: number, z: number) => `${x}:${z}`;
const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

// ---- Graphe de circulation : nœuds aux croisements et aux extrémités, arêtes entre nœuds voisins sur une même rue.
function buildGraph(): Graph {
  const nodes: Record<string, { x: number; z: number }> = {};
  const edges: Record<string, string[]> = {};
  const addNode = (x: number, z: number) => {
    const k = key(x, z);
    if (!nodes[k]) {
      nodes[k] = { x, z };
      edges[k] = [];
    }
    return k;
  };
  const link = (a: string, b: string) => {
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };

  for (const z of H_STREETS) {
    const xs = uniqueSorted([-HALF, HALF, ...V_STREETS, ...(z === 0 ? [0] : [])]);
    let previous: string | null = null;
    for (const x of xs) {
      const k = addNode(x, z);
      if (previous) link(previous, k);
      previous = k;
    }
  }
  for (const x of V_STREETS) {
    const zs = uniqueSorted([-HALF, HALF, ...H_STREETS]);
    let previous: string | null = null;
    for (const z of zs) {
      const k = addNode(x, z);
      if (previous) link(previous, k);
      previous = k;
    }
  }
  // Culs-de-sac du carrefour central, dans le socle.
  const { cross } = GRID_MAP.roads;
  const center = addNode(cross.x, GRID_MAP.roads.z);
  link(center, addNode(cross.x, cross.north));
  link(center, addNode(cross.x, cross.south));

  return { nodes, edges };
}

export const GRAPH = buildGraph();

function degree(k: string) {
  return GRAPH.edges[k]?.length ?? 0;
}

// ---- Pièces de route : carrefours aux nœuds de degré ≥ 3, tronçons droits ailleurs, culs-de-sac du socle.
function buildRoads(): RoadPiece[] {
  const pieces: RoadPiece[] = [];
  for (const z of H_STREETS) {
    for (let x = -HALF; x <= HALF; x++) {
      const k = key(x, z);
      if (GRAPH.nodes[k] && degree(k) >= 3) pieces.push({ kind: "cross", x, z, rot: 0 });
      else pieces.push({ kind: "straight", x, z, rot: 0 });
    }
  }
  for (const x of V_STREETS) {
    for (let z = -HALF; z <= HALF; z++) {
      if (H_STREETS.includes(z)) continue; // déjà posé en carrefour ou en tronçon est-ouest
      pieces.push({ kind: "straight", x, z, rot: Math.PI / 2 });
    }
  }
  const { cross } = GRID_MAP.roads;
  for (const end of [cross.north, cross.south]) {
    const step = Math.sign(end);
    for (let z = step; z !== end; z += step) pieces.push({ kind: "straight", x: cross.x, z, rot: Math.PI / 2 });
    pieces.push({ kind: "end", x: cross.x, z: end, rot: 0 });
  }
  return pieces;
}

export const ROADS = buildRoads();

// ---- Quartiers : chaque case entre deux rues reçoit une maison, un immeuble, un parc, ou reste libre.
const emptyBy = <M extends string>(models: readonly M[]) =>
  Object.fromEntries(models.map((model) => [model, [] as Placement[]])) as unknown as Record<M, Placement[]>;
export const HOUSES = emptyBy(HOUSE_MODELS);
export const COMMERCIALS = emptyBy(COMMERCIAL_MODELS);
export const TREES = emptyBy(TREE_MODELS);
export const LAMPS: Placement[] = [];
export const PLATES: Plate[] = [];
export const PARKS: Vec3[] = [];
export const PEOPLE: { model: PersonModel; x: number; z: number; rot: number }[] = [];

const X_EDGES = [-HALF, ...V_STREETS.filter((x) => x < 0), ...V_STREETS.filter((x) => x > 0), HALF].sort((a, b) => a - b);
const Z_EDGES = [...H_STREETS].sort((a, b) => a - b);

for (let i = 0; i < X_EDGES.length - 1; i++) {
  const x0 = X_EDGES[i];
  const x1 = X_EDGES[i + 1];
  if (x0 === -9 && x1 === 9) continue; // le socle et son carrefour
  for (let j = 0; j < Z_EDGES.length - 1; j++) {
    const z0 = Z_EDGES[j];
    const z1 = Z_EDGES[j + 1];
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const roll = random();

    if (roll < 0.45) {
      const rot = pick(QUARTER_TURNS);
      HOUSES[pick(HOUSE_MODELS)].push({ x: cx + (random() - 0.5), z: cz + (random() - 0.5), rot });
      PLATES.push({ x: cx, z: cz, w: x1 - x0 - 1, d: z1 - z0 - 1, color: "#a7f3d0" });
      if (random() < 0.5) {
        PEOPLE.push({ model: pick(PERSON_MODELS), x: cx + 2.2, z: cz + 2.2, rot: pick(QUARTER_TURNS) });
        PEOPLE.push({ model: pick(PERSON_MODELS), x: cx + 2.6, z: cz + 1.6, rot: pick(QUARTER_TURNS) });
      }
    } else if (roll < 0.65) {
      const rot = pick(QUARTER_TURNS);
      COMMERCIALS[pick(COMMERCIAL_MODELS)].push({ x: cx, z: cz, rot });
      PLATES.push({ x: cx, z: cz, w: x1 - x0 - 1, d: z1 - z0 - 1, color: "#cbd5e1" });
    } else {
      PARKS.push([cx, 0, cz]);
      PLATES.push({ x: cx, z: cz, w: x1 - x0 - 1, d: z1 - z0 - 1, color: "#86efac" });
      for (let t = 0; t < 3; t++) {
        TREES[pick(TREE_MODELS)].push({ x: cx + (random() - 0.5) * 4.5, z: cz + (random() - 0.5) * 4.5, rot: random() * Math.PI * 2 });
      }
    }
    // Deux lampadaires sur les trottoirs, aux coins de la case.
    LAMPS.push({ x: x0 + 0.7, z: z0 + 0.7, rot: 0 });
    LAMPS.push({ x: x1 - 0.7, z: z1 - 0.7, rot: 0 });
  }
}

// ---- Bâtiments du NOC : chacun est relié au nœud de circulation le plus proche (pour l'alerte des PNJ).
export const NOC_NODES: Record<string, string> = {};
for (const building of [...GRID_MAP.buildings.map((b) => ({ id: b.id, x: b.x, z: b.z })), { id: GRID_MAP.shopSite.id, x: GRID_MAP.shopSite.center[0], z: GRID_MAP.shopSite.center[2] }]) {
  let best = "";
  let bestDistance = Infinity;
  for (const [k, node] of Object.entries(GRAPH.nodes)) {
    const distance = Math.hypot(node.x - building.x, node.z - building.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = k;
    }
  }
  NOC_NODES[building.id] = best;
}

// ---- Carrefours à feux : chaque nœud d'au moins trois tronçons. Cycle de 14 s, décalé d'un carrefour à l'autre.
export type Light = "green" | "amber" | "red";
export const SIGNAL_CYCLE = 14;
const GREEN_SECONDS = 6;
const AMBER_SECONDS = 1;

export const SIGNAL_NODES = Object.keys(GRAPH.nodes).filter((key) => degree(key) >= 3);
const SIGNAL_SET = new Set(SIGNAL_NODES);
const SIGNAL_OFFSET = new Map<string, number>(SIGNAL_NODES.map((key, index): [string, number] => [key, (index * 5) % SIGNAL_CYCLE]));

export const isSignal = (node: string) => SIGNAL_SET.has(node);

// État du feu d'un carrefour pour un axe : « h » = circulation est-ouest, « v » = nord-sud. Jamais deux axes au vert.
export function signalState(node: string, axis: "h" | "v", time: number): Light {
  const t = (time + (SIGNAL_OFFSET.get(node) ?? 0)) % SIGNAL_CYCLE;
  if (t < GREEN_SECONDS) return axis === "h" ? "green" : "red";
  if (t < GREEN_SECONDS + AMBER_SECONDS) return axis === "h" ? "amber" : "red";
  if (t < SIGNAL_CYCLE - AMBER_SECONDS) return axis === "h" ? "red" : "green";
  return axis === "h" ? "red" : "amber";
}

// Plus court chemin entre deux nœuds du réseau (parcours en largeur). Tableau vide s'il n'existe pas.
export function shortestPath(from: string, to: string): string[] {
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length && !previous.has(to); i++) {
    for (const next of GRAPH.edges[queue[i]] ?? []) {
      if (!previous.has(next)) {
        previous.set(next, queue[i]);
        queue.push(next);
      }
    }
  }
  if (!previous.has(to)) return [];
  const path: string[] = [];
  for (let node: string | null = to; node !== null; node = previous.get(node) ?? null) path.unshift(node);
  return path;
}
