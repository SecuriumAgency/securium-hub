"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { nodePosition, type Vec3 } from "@/lib/matrix/tools";
import { LAKE_CENTER } from "./Village";
import { useMatrixStore, type MatrixState } from "@/store/useMatrixStore";

// Humeur du village, lue dans le store : une réparation en cours fait réfléchir les PNJ, des tâches en attente
// les font travailler, sinon ils se reposent.
type Mood = "travail" | "optimise" | "repos";

const NPC_COUNT = 10;
const WALK_SPEED = 1.1;
const SHIRTS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#ec4899"];
const SKINS = ["#fcd9b6", "#e0ac69", "#8d5524"];

function moodOf(state: MatrixState): Mood {
  if (Object.values(state.sites).some((runtime) => runtime.repairing)) return "optimise";
  if (state.pendingTotal > 0) return "travail";
  return "repos";
}

// Point visé par un PNJ selon l'humeur.
// - travail : allers-retours devant la salle de sport (Matchmaker) et l'hôpital (Escadron Agents).
// - optimise : cercle autour de la mosquée (Securium OS), à l'arrêt pendant la réflexion.
// - repos : hôtel (Hub 3D) ou promenade au bord du lac.
function goalFor(kind: Mood, index: number, time: number): Vector3 {
  const angle = (index / NPC_COUNT) * Math.PI * 2;
  if (kind === "optimise") {
    const mosque = nodePosition("securium-os") ?? [0, 0, 0];
    return new Vector3(mosque[0] + Math.cos(angle) * 2.6, 0, mosque[2] + Math.sin(angle) * 2.6);
  }
  if (kind === "travail") {
    const building: Vec3 = nodePosition(index % 2 === 0 ? "matchmaker" : "escadron") ?? [0, 0, 0];
    const shuttle = Math.sin(time * 1.2 + index) > 0 ? 1.1 : -1.1;
    return new Vector3(building[0] + shuttle, 0, building[2] + 1.9 + (index % 3) * 0.3);
  }
  if (index % 3 === 0) {
    const hotel = nodePosition("hub-3d") ?? [0, 0, 0];
    return new Vector3(hotel[0] + 2.2, 0, hotel[2] + 1.4 + (index % 2) * 0.3);
  }
  const stroll = angle + time * 0.15;
  return new Vector3(LAKE_CENTER[0] + Math.cos(stroll) * 6.2, 0, LAKE_CENTER[2] + Math.sin(stroll) * 6.2);
}

// Un PNJ : une capsule pour le corps, une sphère pour la tête. Il marche vers son point, sautille au travail.
function Npc({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const position = useRef(new Vector3(-2 + index * 0.4, 0, 2.5));
  const shirt = SHIRTS[index % SHIRTS.length];
  const skin = SKINS[index % SKINS.length];

  useFrame((state, delta) => {
    const element = group.current;
    if (!element) return;
    const time = state.clock.elapsedTime;
    const kind = moodOf(useMatrixStore.getState());
    const direction = goalFor(kind, index, time).sub(position.current);
    direction.y = 0;
    const distance = direction.length();
    const step = WALK_SPEED * delta;
    if (distance > step) {
      direction.multiplyScalar(step / distance);
      position.current.add(direction);
      element.rotation.y = Math.atan2(direction.x, direction.z);
    }
    const bob = kind === "travail" ? Math.abs(Math.sin(time * 9 + index)) * 0.25 : kind === "repos" ? 0.02 * Math.sin(time * 2 + index) : 0;
    element.position.set(position.current.x, bob, position.current.z);
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.22, 4, 8]} />
        <meshStandardMaterial color={shirt} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.66, 0]} castShadow>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
    </group>
  );
}

// Figurants du village : leur comportement suit l'activité réelle du store.
export function Npcs() {
  return (
    <group>
      {Array.from({ length: NPC_COUNT }, (_, index) => (
        <Npc key={index} index={index} />
      ))}
    </group>
  );
}
