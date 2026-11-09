import { nodePosition, type Vec3 } from "@/lib/matrix/tools";

// Réseau routier du village : chaque paire relie deux bâtiments (outils ou sites). Une route part du bord d'un
// bâtiment, pas de son centre : les véhicules ne traversent jamais les façades.
export const ROAD_LINKS: [string, string][] = [
  ["securium-os", "batcave"],
  ["securium-os", "hub-3d"],
  ["securium-os", "ecosystem"],
  ["batcave", "ecosystem"],
  ["ecosystem", "hub-3d"],
  ["securium-os", "matchmaker"],
  ["matchmaker", "prospection"],
  ["matchmaker", "osint"],
  ["matchmaker", "lead-broker"],
  ["prospection", "osint"],
  ["osint", "lead-broker"],
  ["securium-os", "reels"],
  ["securium-os", "iafluencer"],
  ["iafluencer", "images"],
  ["securium-os", "parc-sites"],
  ["parc-sites", "labs"],
  ["parc-sites", "vitrine"],
  ["parc-sites", "geoenergy-habitat"],
  ["parc-sites", "elite-depannage-34"],
  ["parc-sites", "rescue-247-uk"],
  ["securium-os", "escadron"],
  ["escadron", "audit-seo"],
  ["escadron", "rapports"],
  ["escadron", "planning"],
  ["images", "escadron"],
];

// Boucles des véhicules : chaque boucle suit des routes existantes et revient à son point de départ.
export const TRAFFIC_LOOPS: string[][] = [
  ["securium-os", "batcave", "ecosystem", "hub-3d"],
  ["matchmaker", "prospection", "osint", "lead-broker"],
  ["securium-os", "iafluencer", "images", "escadron"],
];

// Distance entre le centre d'un bâtiment et le bord de sa route (demi-largeur approximative d'un bâtiment).
const EDGE_GAP = 1.4;

/** Extrémités d'une route entre deux bâtiments, au bord de chacun. Null si un bâtiment est inconnu. */
export function roadEnds(fromId: string, toId: string): [Vec3, Vec3] | null {
  const a = nodePosition(fromId);
  const b = nodePosition(toId);
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dz);
  if (length <= EDGE_GAP * 2) return null;
  const ux = dx / length;
  const uz = dz / length;
  return [
    [a[0] + ux * EDGE_GAP, 0, a[2] + uz * EDGE_GAP],
    [b[0] - ux * EDGE_GAP, 0, b[2] - uz * EDGE_GAP],
  ];
}

/** Points d'une boucle de véhicule : pour chaque tronçon, le départ puis l'arrivée au bord des bâtiments. */
export function loopWaypoints(ids: string[]): Vec3[] {
  const points: Vec3[] = [];
  for (let index = 0; index < ids.length; index++) {
    const ends = roadEnds(ids[index], ids[(index + 1) % ids.length]);
    if (ends) points.push(ends[0], ends[1]);
  }
  return points;
}

/** Distance entre un point (x, z) et un tronçon de route, dans le plan du sol. */
export function distanceToSegment(px: number, pz: number, [ax, , az]: Vec3, [bx, , bz]: Vec3): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
