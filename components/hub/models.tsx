"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import { AdditiveBlending, MathUtils, type BoxGeometry, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import type { Site } from "@/lib/sites";
import { useTelemetrySignals } from "@/lib/use-telemetry";

export const palette = {
  online: "#22d3ee",
  offline: "#f43f5e",
  unknown: "#64748b",
  hq: "#fbbf24",
  body: "#1e293b",
  bodyOffline: "#111827",
};

// Hauteur du sommet de la flèche du QG (podium 0.6 + tour 5 + couronne 0.8 + flèche 1.2).
const HQ_HEIGHT = 7.6;

// Clignotement d'alerte des bâtiments hors ligne : intensité émissive maximale et pulsation (rad/s).
const ALERT_INTENSITY = 0.9;
const ALERT_SPEED = 7;

// Alerte du QG : un agent critique (Orchestrateur) en erreur selon la télémétrie du poste. La tour
// s'allume en rouge et une aura additive pulse autour, plus lentement que les sites hors ligne.
const HQ_ALERT_COLOR = "#ef4444";
const HQ_ALERT_INTENSITY = 1.2;
const HQ_ALERT_SPEED = 3.5;
const HQ_AURA_OPACITY = 0.3;

// Décor : il ne doit ni capter le survol ni masquer le clic sur le QG.
const noRaycast = () => null;

export function siteHeight(site: Site) {
  return site.kind === "hq" ? HQ_HEIGHT : 1.2 + site.traffic / 5000;
}

export function siteAccent(site: Site) {
  if (site.kind === "hq") return palette.hq;
  return palette[site.status];
}

type ModelProps = {
  site: Site;
  active: boolean;
};

export function BuildingModel({ site, active }: ModelProps) {
  const body = useRef<MeshStandardMaterial>(null);
  const height = siteHeight(site);
  const online = site.status === "online";
  const offline = site.status === "offline";
  const accent = siteAccent(site);
  const floors = Math.floor((height - 0.4) / 0.8);

  // Échec de build : le corps du bâtiment clignote en rouge, en phase sur toute la flotte (horloge
  // partagée). emissiveIntensity n'est piloté que d'ici ; la prop JSX reste à 0 et n'est jamais réappliquée.
  useFrame(({ clock }) => {
    if (!body.current) return;
    body.current.emissiveIntensity = offline
      ? ALERT_INTENSITY * (0.5 + 0.5 * Math.sin(clock.elapsedTime * ALERT_SPEED)) ** 2
      : 0;
  });

  return (
    <group>
      <mesh name="body" position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, height, 1.6]} />
        <meshStandardMaterial
          ref={body}
          color={online ? palette.body : palette.bodyOffline}
          emissive={palette.offline}
          emissiveIntensity={0}
          roughness={0.55}
          metalness={0.35}
        />
        <Edges color={accent} lineWidth={1.5} transparent opacity={active ? 1 : 0.45} />
      </mesh>

      {Array.from({ length: floors }, (_, floor) => (
        <mesh key={floor} position={[0, 0.6 + floor * 0.8, 0]}>
          <boxGeometry args={[1.64, 0.06, 1.64]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={online ? (active ? 2 : 1.1) : 0.25}
            toneMapped={false}
          />
        </mesh>
      ))}

      <mesh position={[0, height + 0.15, 0]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.5]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={online ? 2.5 : 0.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function HeadquartersModel({ active }: ModelProps) {
  const halo = useRef<Mesh>(null);
  const tower = useRef<MeshStandardMaterial>(null);
  const aura = useRef<Mesh<BoxGeometry, MeshBasicMaterial>>(null);
  // De 0 à 1, amorti : l'alerte monte et s'éteint en fondu au lieu de basculer d'un coup.
  const alertLevel = useRef(0);
  // Seul ce modèle se re-rend quand l'alerte bascule ; le reste de la scène n'est pas touché.
  const { hqAlert } = useTelemetrySignals();

  // emissiveIntensity de la tour et opacité de l'aura ne sont pilotées que d'ici ; leurs props
  // JSX restent à 0 et ne sont jamais réappliquées.
  useFrame(({ clock }, delta) => {
    if (halo.current) halo.current.rotation.z += delta * 0.6;
    alertLevel.current = MathUtils.damp(alertLevel.current, hqAlert ? 1 : 0, 3, delta);
    const glow = alertLevel.current * (0.5 + 0.5 * Math.sin(clock.elapsedTime * HQ_ALERT_SPEED)) ** 2;
    if (tower.current) tower.current.emissiveIntensity = HQ_ALERT_INTENSITY * glow;
    if (aura.current) {
      aura.current.visible = alertLevel.current > 0.001;
      aura.current.material.opacity = HQ_AURA_OPACITY * glow;
    }
  });

  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.6, 3.2]} />
        <meshStandardMaterial color="#1c1917" roughness={0.7} metalness={0.4} />
        <Edges color={palette.hq} lineWidth={1.5} transparent opacity={0.6} />
      </mesh>

      <mesh position={[0, 3.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 5, 2.2]} />
        <meshStandardMaterial
          ref={tower}
          color="#292524"
          emissive={HQ_ALERT_COLOR}
          emissiveIntensity={0}
          roughness={0.35}
          metalness={0.6}
        />
        <Edges color={palette.hq} lineWidth={2} transparent opacity={active ? 1 : 0.7} />
      </mesh>

      <mesh ref={aura} position={[0, 3.1, 0]} raycast={noRaycast}>
        <boxGeometry args={[2.7, 5.5, 2.7]} />
        <meshBasicMaterial
          color={HQ_ALERT_COLOR}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {Array.from({ length: 6 }, (_, floor) => (
        <mesh key={floor} position={[0, 1.2 + floor * 0.8, 0]}>
          <boxGeometry args={[2.24, 0.08, 2.24]} />
          <meshStandardMaterial
            color={palette.hq}
            emissive={palette.hq}
            emissiveIntensity={active ? 2.2 : 1.4}
            toneMapped={false}
          />
        </mesh>
      ))}

      <mesh position={[0, 6, 0]} castShadow>
        <boxGeometry args={[1.4, 0.8, 1.4]} />
        <meshStandardMaterial
          color={palette.hq}
          emissive={palette.hq}
          emissiveIntensity={active ? 1.6 : 0.9}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[0.04, 0.1, 1.2, 8]} />
        <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={3} toneMapped={false} />
      </mesh>

      <mesh ref={halo} position={[0, 3.6, 0]} rotation={[Math.PI / 2 + 0.2, 0, 0]}>
        <torusGeometry args={[2, 0.04, 8, 96, Math.PI * 1.5]} />
        <meshBasicMaterial color={palette.hq} toneMapped={false} />
      </mesh>

      <pointLight position={[0, 6.8, 0]} color={palette.hq} intensity={active ? 45 : 25} distance={12} />
    </group>
  );
}
