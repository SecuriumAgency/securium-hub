"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, Vector3, type Group } from "three";
import type { Site } from "@/lib/sites";
import { useTelemetry } from "@/lib/use-telemetry";
import { HOUSES, houseStop, pathFrom, RING_NODES, RING_RADIUS, ringNode, ringPoint, siteStop } from "./city-layout";

// La vie de la ville : les agents travaillent devant leur immeuble (leur dépôt), font du sport à la salle,
// dorment au dortoir la nuit, et Felix Fix patrouille en voiture ou répare à l'alerte. Des passants et des
// voitures circulent en permanence. Tout est piloté par useFrame, sans état React : la télémétrie ne sert
// qu'à choisir l'activité, toutes les 10 s.

const FELIX = "Felix Fix";
const WALK_SPEED = 1.1;
const DRIVE_SPEED = 2.4;
// Au-delà de cette longueur de route, l'agent prend sa voiture.
const DRIVE_FROM = 5;
// Une alerte critique de Felix Fix déclenche son intervention pendant 30 minutes.
const ALERT_WINDOW_MS = 30 * 60_000;
const NIGHT_START = 22;
const NIGHT_END = 7;

// Agents, avec l'immeuble où ils travaillent. Felix Fix n'a pas d'immeuble : il patrouille.
const AGENTS: { name: string; color: string; siteId: string | null }[] = [
  { name: "Orchestrateur", color: "#fbbf24", siteId: "securium-agency" },
  { name: "Market Simulator", color: "#f472b6", siteId: "securium-labs" },
  { name: "Lead Prospector", color: "#34d399", siteId: "geoenergy-habitat" },
  { name: "CFO", color: "#60a5fa", siteId: "securium-agency" },
  { name: "DevOps", color: "#a78bfa", siteId: "rescue-247-uk" },
  { name: "SEO Architect", color: "#fb923c", siteId: "elite-depannage-34" },
  { name: FELIX, color: "#f43f5e", siteId: null },
];

// Passants : ils suivent l'anneau à pied, à des points de départ différents.
const PASSERSBY = [
  { color: "#22d3ee", start: 2 },
  { color: "#e879f9", start: 6 },
];

// Voitures de la circulation : chacune tourne sur sa voie, à sa vitesse.
const TRAFFIC = [
  { color: "#facc15", angle: 0, speed: 0.42, lane: 0.3 },
  { color: "#38bdf8", angle: 2.4, speed: 0.34, lane: -0.3 },
  { color: "#fb7185", angle: 4.3, speed: 0.5, lane: 0.3 },
];

const TREES: [number, number, number][] = [
  [-8.2, 0, -7.2],
  [8.2, 0, 7.2],
  [-8.2, 0, 7.2],
  [8.2, 0, -7.2],
];

type Activity = "move" | "work" | "gym" | "sleep" | "alert" | "patrol";
interface Desire {
  key: string;
  activity: Activity;
  stop: Vector3;
}
interface Snapshot {
  statuses: Map<string, string>;
  alert: boolean;
}
interface Motion {
  key: string;
  path: Vector3[];
  seg: number;
  t: number;
  driving: boolean;
  patrol: number;
  spawned: boolean;
}

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "numeric", hour12: false });
const parisHour = (date: Date) => Number(hourFormat.format(date)) % 24;

const pathLength = (path: Vector3[]) => path.reduce((sum, point, index) => (index === 0 ? 0 : sum + point.distanceTo(path[index - 1])), 0);

/** Avance le long du chemin de `distance` unités, sans dépasser le dernier point. */
function walk(motion: Motion, distance: number) {
  let remaining = distance;
  while (remaining > 0 && motion.seg < motion.path.length - 1) {
    const from = motion.path[motion.seg];
    const to = motion.path[motion.seg + 1];
    const length = from.distanceTo(to);
    const left = length * (1 - motion.t);
    if (remaining >= left) {
      remaining -= left;
      motion.seg += 1;
      motion.t = 0;
    } else {
      motion.t += remaining / length;
      remaining = 0;
    }
  }
}

/** Ce que doit faire un personnage à cet instant, d'après la télémétrie et l'heure de Paris. */
function desireFor(
  kind: "agent" | "passer",
  name: string,
  siteId: string | null,
  slot: number,
  patrol: number,
  snapshot: Snapshot,
  night: boolean,
  sites: Map<string, Site>,
): Desire {
  const stopAt = (id: string | null, offset: number) => {
    const site = id ? sites.get(id) : undefined;
    const stop = site ? siteStop(site) : ringNode(0);
    return stop.add(new Vector3(offset * 0.35, 0, 0));
  };
  if (kind === "passer" || name === FELIX) {
    if (name === FELIX && snapshot.alert) {
      return { key: "alert:qg", activity: "alert", stop: stopAt("securium-agency", slot) };
    }
    return { key: `patrol:${patrol}`, activity: "patrol", stop: ringNode(patrol) };
  }
  const status = snapshot.statuses.get(name);
  if (status === "error") return { key: `alert:${siteId}`, activity: "alert", stop: stopAt(siteId, slot) };
  if (status === "running") return { key: `work:${siteId}`, activity: "work", stop: stopAt(siteId, slot) };
  if (night) return { key: "sleep", activity: "sleep", stop: houseStop("dortoir").add(new Vector3(slot * 0.35, 0, 0)) };
  return { key: "gym", activity: "gym", stop: houseStop("gym").add(new Vector3(slot * 0.35, 0, 0)) };
}

/** Voiture vue de côté-avant : la face avant est en +z, comme le reste de la scène. */
function CarBody({ color }: { color: string }) {
  const wheels: [number, number][] = [
    [-0.3, 0.3],
    [0.3, 0.3],
    [-0.3, -0.3],
    [0.3, -0.3],
  ];
  return (
    <group>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.6, 0.2, 0.95]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.42, -0.08]}>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshStandardMaterial color="#0f172a" roughness={0.3} />
      </mesh>
      {wheels.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
          <meshStandardMaterial color="#020617" />
        </mesh>
      ))}
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.24, 0.48]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

interface CharacterProps {
  name: string;
  color: string;
  kind: "agent" | "passer";
  siteId: string | null;
  slot: number;
  start: number;
  drive: boolean;
  sites: Map<string, Site>;
  snapshot: RefObject<Snapshot>;
  portal: RefObject<HTMLElement>;
}

function Character({ name, color, kind, siteId, slot, start, drive, sites, snapshot, portal }: CharacterProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const car = useRef<Group>(null);
  const thought = useRef<Group>(null);
  const star = useRef<Group>(null);
  const zed = useRef<Group>(null);
  const alertIcon = useRef<Group>(null);
  const motion = useRef<Motion>({ key: "", path: [], seg: 0, t: 0, driving: drive, patrol: start, spawned: false });

  useFrame(({ clock }, delta) => {
    const node = root.current;
    const pose = body.current;
    if (!node || !pose) return;
    const m = motion.current;
    if (!m.spawned) {
      node.position.copy(ringNode(start));
      m.spawned = true;
    }

    const hour = parisHour(new Date());
    const want = desireFor(kind, name, siteId, slot, m.patrol, snapshot.current, hour >= NIGHT_START || hour < NIGHT_END, sites);
    if (want.key !== m.key) {
      m.key = want.key;
      m.path = pathFrom(node.position, want.stop);
      m.seg = 0;
      m.t = 0;
      m.driving = drive || pathLength(m.path) > DRIVE_FROM;
    }

    const last = m.path.length - 1;
    const moving = m.seg < last;
    if (moving) {
      walk(m, delta * (m.driving ? DRIVE_SPEED : WALK_SPEED));
      const from = m.path[Math.min(m.seg, last)];
      const to = m.path[Math.min(m.seg + 1, last)];
      node.position.lerpVectors(from, to, m.t);
      if (from.distanceToSquared(to) > 1e-6) node.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    } else if (want.activity === "patrol") {
      // Arrivé à un point de patrouille : le suivant de l'anneau.
      m.patrol = (m.patrol + 1) % RING_NODES;
      m.key = "";
    }

    const t = clock.elapsedTime;
    const walking = moving && !m.driving;
    const driving = moving && m.driving;
    const activity: Activity = moving ? "move" : want.activity;
    const swing = walking ? Math.sin(t * 9) : 0;

    // Poses : les bras et les jambes suivent l'activité, le corps se soulève en voiture ou en sport.
    let armTarget = 0;
    let legTarget = swing * 0.6;
    let bodyY = walking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0;
    let bodyRot = 0;
    if (driving) {
      armTarget = -0.9;
      legTarget = 0;
      bodyY = 0.3;
    } else if (activity === "work") {
      armTarget = -1.2 + Math.sin(t * 10) * 0.25;
      legTarget = 0;
    } else if (activity === "gym") {
      armTarget = -2.7 + Math.sin(t * 8) * 0.25;
      legTarget = Math.sin(t * 8) * 0.25;
      bodyY = Math.abs(Math.sin(t * 4)) * 0.3;
    } else if (activity === "sleep") {
      bodyRot = -Math.PI / 2;
      bodyY = 0.12;
      legTarget = 0;
    } else if (activity === "alert") {
      armTarget = -2.8;
      legTarget = 0;
      bodyY = Math.sin(t * 6) * 0.03;
    }

    pose.rotation.x = MathUtils.damp(pose.rotation.x, bodyRot, 6, delta);
    pose.position.y = MathUtils.damp(pose.position.y, bodyY, 10, delta);
    if (legL.current) legL.current.rotation.x = legTarget;
    if (legR.current) legR.current.rotation.x = -legTarget;
    if (armL.current) armL.current.rotation.x = armTarget;
    if (armR.current) armR.current.rotation.x = activity === "gym" ? armTarget : armTarget + (activity === "work" ? Math.PI : 0);
    if (car.current) car.current.visible = driving;
    if (thought.current) thought.current.visible = activity === "work";
    if (star.current) {
      star.current.visible = activity === "gym";
      star.current.rotation.y = t * 2;
    }
    if (zed.current) {
      zed.current.visible = activity === "sleep";
      zed.current.position.y = 1.5 + Math.sin(t * 2) * 0.06;
    }
    if (alertIcon.current) {
      alertIcon.current.visible = activity === "alert";
      alertIcon.current.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
    }
  });

  return (
    <group ref={root}>
      <group ref={car} visible={false}>
        <CarBody color={color} />
      </group>
      <group ref={body}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[0.34, 0.46, 0.22]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.02, 0]} castShadow>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial color="#fcd9b6" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.14, 0]}>
          <boxGeometry args={[0.28, 0.08, 0.28]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <group ref={armL} position={[-0.23, 0.82, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group ref={armR} position={[0.23, 0.82, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group ref={legL} position={[-0.09, 0.4, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.12]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
        <group ref={legR} position={[0.09, 0.4, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.12]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
      </group>

      {/* Bulles d'activité : réflexion (points), sport (étoile), sommeil (cube bleu), alerte (sphère rouge). */}
      <group ref={thought} position={[0, 1.45, 0]} visible={false}>
        {[-0.12, 0, 0.12].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#e2e8f0" emissive="#e2e8f0" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={star} position={[0, 1.5, 0]} visible={false}>
        <mesh>
          <octahedronGeometry args={[0.1]} />
          <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      </group>
      <group ref={zed} position={[0, 1.5, 0]} visible={false}>
        <mesh>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
      <group ref={alertIcon} position={[0, 1.55, 0]} visible={false}>
        <mesh>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>

      {kind === "agent" && (
        <Html position={[0, 1.85, 0]} center portal={portal} zIndexRange={[10, 0]}>
          <span className="whitespace-nowrap rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200 shadow">
            {name}
          </span>
        </Html>
      )}
    </group>
  );
}

function TrafficCar({ color, angle, speed, lane }: { color: string; angle: number; speed: number; lane: number }) {
  const root = useRef<Group>(null);
  const theta = useRef(angle);
  useFrame((_, delta) => {
    const node = root.current;
    if (!node) return;
    theta.current += delta * speed;
    const p = ringPoint(theta.current, RING_RADIUS + lane);
    node.position.copy(p);
    // Le sens de circulation suit la tangente de l'anneau.
    node.rotation.y = -theta.current;
  });
  return (
    <group ref={root}>
      <CarBody color={color} />
    </group>
  );
}

function Roads() {
  const spokes = Array.from({ length: RING_NODES }, (_, k) => k * ((Math.PI * 2) / RING_NODES));
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <ringGeometry args={[RING_RADIUS - 0.45, RING_RADIUS + 0.45, 96]} />
        <meshStandardMaterial color="#111827" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[RING_RADIUS - 0.03, RING_RADIUS + 0.03, 96]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.35} />
      </mesh>
      {spokes.map((angle) => (
        <mesh
          key={angle}
          position={[(Math.cos(angle) * RING_RADIUS) / 2, 0.012, (Math.sin(angle) * RING_RADIUS) / 2]}
          rotation={[0, Math.PI / 2 - angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[0.5, 0.02, RING_RADIUS]} />
          <meshStandardMaterial color="#111827" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function House({ label, color, position, portal }: { label: string; color: string; position: Vector3; portal: RefObject<HTMLElement> }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.7, 0.9]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.78, 0.5, 4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.3, 0.46]}>
        <boxGeometry args={[0.22, 0.3, 0.02]} />
        <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <Html position={[0, 1.3, 0]} center portal={portal} zIndexRange={[10, 0]}>
        <span className="whitespace-nowrap rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 shadow">
          {label}
        </span>
      </Html>
    </group>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.6, 8]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color="#2dd4bf" emissive="#0d9488" emissiveIntensity={0.25} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** La ville vivante, posée dans la scène du Hub. `sites` donne l'emplacement des immeubles, `portal` l'overlay. */
export function CityLife({ sites, portal }: { sites: Site[]; portal: RefObject<HTMLElement> }) {
  const { data } = useTelemetry();
  const snapshot = useRef<Snapshot>({ statuses: new Map(), alert: false });
  const siteMap = useMemo(() => new Map(sites.map((site): [string, Site] => [site.id, site])), [sites]);

  // Mise à jour de la télémétrie : on relit la ref dans useFrame, sans re-rendre la ville.
  useEffect(() => {
    const report = data?.report && !data.stale ? data.report : null;
    snapshot.current = {
      statuses: new Map<string, string>((report?.agents ?? []).map((agent) => [agent.name, agent.status])),
      alert: (report?.felix ?? []).some(
        (alert) => alert.severity === "critical" && Date.now() - Date.parse(alert.at) < ALERT_WINDOW_MS,
      ),
    };
  }, [data]);

  return (
    <group>
      <Roads />
      {HOUSES.map((house) => (
        <House key={house.id} label={house.label} color={house.color} position={house.position.clone()} portal={portal} />
      ))}
      {TREES.map((position) => (
        <Tree key={position.join(",")} position={position} />
      ))}
      {AGENTS.map((agent, index) => (
        <Character
          key={agent.name}
          name={agent.name}
          color={agent.color}
          kind="agent"
          siteId={agent.siteId}
          slot={index % 3}
          start={index}
          drive={agent.name === FELIX}
          sites={siteMap}
          snapshot={snapshot}
          portal={portal}
        />
      ))}
      {PASSERSBY.map((passer, index) => (
        <Character
          key={`passant-${index}`}
          name=""
          color={passer.color}
          kind="passer"
          siteId={null}
          slot={0}
          start={passer.start}
          drive={false}
          sites={siteMap}
          snapshot={snapshot}
          portal={portal}
        />
      ))}
      {TRAFFIC.map((car, index) => (
        <TrafficCar key={`voiture-${index}`} color={car.color} angle={car.angle} speed={car.speed} lane={car.lane} />
      ))}
    </group>
  );
}
