import { Vector3 } from "three";
import type { Site } from "@/lib/sites";

// Plan de la ville, en unités de scène. Une roue de routes autour du QG : un anneau et des rayons. Les
// immeubles (dépôts) et les maisons (ressources de Securium) bordent l'anneau ; un agent rejoint leur entrée
// par la route la plus courte, puis fait les derniers pas à pied.
export const RING_RADIUS = 4;
export const RING_NODES = 8;
const STEP = (Math.PI * 2) / RING_NODES;

// Maisons : chaque maison est une ressource de l'écosystème. « gym » et « dortoir » sont les lieux où les
// agents inoccupés font du sport ou dorment.
export const HOUSES = [
  { id: "image-studio", label: "Image Studio", color: "#f472b6", position: new Vector3(5, 0, 5) },
  { id: "reels-studio", label: "Reels Studio", color: "#38bdf8", position: new Vector3(-5, 0, 5) },
  { id: "osint", label: "OSINT", color: "#a3e635", position: new Vector3(-5, 0, -5) },
  { id: "pagespeed", label: "PageSpeed", color: "#fbbf24", position: new Vector3(5, 0, -5) },
  { id: "leads", label: "Leads", color: "#34d399", position: new Vector3(8, 0, 2.5) },
  { id: "rapports", label: "Rapports", color: "#c084fc", position: new Vector3(-3, 0, 7.2) },
  { id: "gym", label: "Salle de sport", color: "#fb7185", position: new Vector3(-2.5, 0, -7.2) },
  { id: "dortoir", label: "Dortoir", color: "#818cf8", position: new Vector3(-7.5, 0, -2.5) },
] as const;

// Nœuds de route : « qg » au centre, « r0 » à « r7 » sur l'anneau, dans le sens des aiguilles d'une montre.
const NODES = new Map<string, Vector3>([["qg", new Vector3(0, 0, 0)]]);
for (let k = 0; k < RING_NODES; k++) {
  NODES.set(`r${k}`, ringPoint(k * STEP));
}

const LINKS = new Map<string, string[]>();
function link(a: string, b: string) {
  LINKS.set(a, [...(LINKS.get(a) ?? []), b]);
  LINKS.set(b, [...(LINKS.get(b) ?? []), a]);
}
for (let k = 0; k < RING_NODES; k++) {
  link(`r${k}`, `r${(k + 1) % RING_NODES}`);
  link("qg", `r${k}`);
}

const at = (id: string) => NODES.get(id) ?? new Vector3();

/** Point de l'anneau à un angle donné, en radians. */
export function ringPoint(angle: number, radius = RING_RADIUS): Vector3 {
  return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

/** Nœud de l'anneau d'index donné ; l'index est pris modulo le nombre de nœuds. */
export function ringNode(index: number): Vector3 {
  return ringPoint((((index % RING_NODES) + RING_NODES) % RING_NODES) * STEP);
}

function nearestNodeId(point: Vector3): string {
  let best = "qg";
  let bestDistance = Infinity;
  for (const [id, position] of NODES) {
    const distance = position.distanceToSquared(point);
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

/** Suite de nœuds la plus courte entre deux nœuds (Dijkstra : le réseau ne compte que neuf nœuds). */
function shortestIds(from: string, to: string): string[] {
  const distance = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const done = new Set<string>();
  for (let step = 0; step < NODES.size; step++) {
    let current: string | null = null;
    for (const [id, value] of distance) {
      if (!done.has(id) && (current === null || value < (distance.get(current) ?? Infinity))) current = id;
    }
    if (current === null || current === to) break;
    done.add(current);
    for (const next of LINKS.get(current) ?? []) {
      const candidate = (distance.get(current) ?? 0) + at(current).distanceTo(at(next));
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        previous.set(next, current);
      }
    }
  }
  const ids = [to];
  let node = to;
  while (node !== from) {
    const before = previous.get(node);
    if (!before) return [from];
    ids.unshift(before);
    node = before;
  }
  return ids;
}

/** Chemin de `start` à `goal` : jusqu'au nœud de route le plus proche, puis la route, puis le dernier pas. */
export function pathFrom(start: Vector3, goal: Vector3): Vector3[] {
  const ids = shortestIds(nearestNodeId(start), nearestNodeId(goal));
  const points = [start.clone(), ...ids.map((id) => at(id).clone()), goal.clone()];
  // Un point confondu avec le précédent ferait un segment nul : il est retiré.
  return points.filter((point, index) => index === 0 || point.distanceTo(points[index - 1]) > 1e-3);
}

/** Arrêt d'un agent devant un immeuble : du côté de la route, à quelques pas de l'entrée. */
export function siteStop(site: Site): Vector3 {
  if (site.kind === "hq") return new Vector3(1.4, 0, 1.4);
  const center = new Vector3(site.coords[0], 0, site.coords[2]);
  const towardRoad = center.clone().negate().normalize();
  return center.add(towardRoad.multiplyScalar(1.3));
}

/** Position d'une maison, par son identifiant. */
export function houseStop(id: string): Vector3 {
  const house = HOUSES.find((item) => item.id === id);
  return house ? house.position.clone() : new Vector3();
}
