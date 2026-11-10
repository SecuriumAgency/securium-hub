"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { MathUtils, Mesh, MeshStandardMaterial, type Group } from "three";
import { useHubStore, type SiteStatus } from "@/store/useHubStore";
import { useCoreToolsStore } from "@/store/useCoreToolsStore";
import { STATE_GLOW } from "@/lib/coreToolState";
import { PROSPECT_BUILDING_ID, type Vec3 } from "./hubGrid";

export type OpenHandler = (href: string) => void;

// Lueur par état, dans l'ordre de priorité : alerte du site, demande B2B, lead en attente, sélection, fenêtres la nuit.
const ALERT_GLOW: Record<SiteStatus, { color: string; intensity: number }> = {
  online: { color: "#000000", intensity: 0 },
  maintenance: { color: "#f59e0b", intensity: 0.4 },
  offline: { color: "#ef4444", intensity: 0.4 },
};
const SELECTED_GLOW = { color: "#22d3ee", intensity: 0.35 };
// Bâtiment de prospection avec un lead non vu : violet, qui pulse (voir la boucle d'images).
const LEAD_GLOW = { color: "#a78bfa", intensity: 0.3 };
// Demande B2B qui attend un audit : ambre, plus prioritaire que le violet des leads.
const B2B_GLOW = { color: "#f59e0b", intensity: 0.3 };
const WINDOW_GLOW = { color: "#fbbf24", intensity: 0.12 };
// Service dégradé ou en erreur : lueur ambre ou rouge, selon le palier (couleurs de lib/coreToolState.ts).
const SERVICE_GLOW = {
  warning: { color: STATE_GLOW.warning, intensity: 0.3 },
  error: { color: STATE_GLOW.error, intensity: 0.4 },
};

// Bâtiment interactif. Au survol : curseur pointeur, identifiant dans le store (infobulle de l'overlay), +5 % d'échelle.
// Premier clic : sélection (la caméra s'approche, la barre latérale affiche l'outil). Second clic : page admin liée.
// `toolGlow` : couleur d'alerte de l'outil, utilisée comme lueur de sélection à la place du cyan.
export function InteractiveBuilding({
  id,
  href,
  position,
  rotation,
  onOpen,
  toolGlow,
  children,
}: {
  id: string;
  href: string;
  position: Vec3;
  rotation: number;
  onOpen: OpenHandler;
  toolGlow?: string;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const setActiveNode = useHubStore((state) => state.setActiveNode);
  const status = useHubStore((state) => state.sitesNetwork.find((site) => site.id === id)?.status ?? "online");
  const selected = useHubStore((state) => state.selectedNode === id);
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const leadAlert = useHubStore((state) => id === PROSPECT_BUILDING_ID && state.unseenLeads > 0);
  const b2bAlert = useHubStore((state) => id === PROSPECT_BUILDING_ID && state.b2bProspects.some((item) => item.status === "À auditer"));
  // État de service de l'outil, publié par la barre latérale : vert, ambre ou rouge.
  const serviceState = useCoreToolsStore((state) => state.states[id] ?? "unknown");
  const serviceGlow = serviceState === "error" ? SERVICE_GLOW.error : serviceState === "warning" ? SERVICE_GLOW.warning : null;
  // Pulsation : alertes (lead, B2B, service en erreur) et outil sélectionné.
  const pulsing = leadAlert || b2bAlert || serviceState === "error" || (selected && toolGlow !== undefined);
  const selectedGlow = useMemo(() => (toolGlow ? { color: toolGlow, intensity: SELECTED_GLOW.intensity } : SELECTED_GLOW), [toolGlow]);
  const glow =
    status !== "online"
      ? ALERT_GLOW[status]
      : b2bAlert
        ? B2B_GLOW
        : leadAlert
          ? LEAD_GLOW
          : selected
            ? selectedGlow
            : (serviceGlow ?? (timeOfDay === "nuit" ? WINDOW_GLOW : ALERT_GLOW.online));
  // Matériaux standard du bâtiment : la lueur s'y applique, et la pulsation les fait varier à chaque image.
  const litMaterials = useRef<MeshStandardMaterial[]>([]);
  useCursor(hovered);

  // Les modèles gltf partagent leurs matériaux entre bâtiments identiques : chaque instance reçoit les siens, pour une lueur propre.
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone();
      }
    });
  }, []);

  // Lueur : seuls les matériaux standard reçoivent une émission.
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const lit: MeshStandardMaterial[] = [];
    group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) {
          material.emissive.set(glow.color);
          material.emissiveIntensity = glow.intensity;
          lit.push(material);
        }
      }
    });
    litMaterials.current = lit;
  }, [glow]);

  useFrame((state, delta) => {
    const group = ref.current;
    if (!group) return;
    group.scale.setScalar(MathUtils.damp(group.scale.x, hovered ? 1.05 : 1, 10, delta));
    if (pulsing) {
      // Pulsation de 0,2 à 0,4 : le bâtiment respire tant qu'un lead n'a pas été vu ou qu'une demande B2B attend.
      const pulse = 0.3 + 0.1 * Math.sin(state.clock.elapsedTime * 3);
      for (const material of litMaterials.current) material.emissiveIntensity = pulse;
    }
  });

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
    setActiveNode(id);
  };
  const handlePointerOut = () => {
    setHovered(false);
    setActiveNode(null);
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const { selectedNode, selectNode } = useHubStore.getState();
    if (selectedNode === id) onOpen(href);
    else selectNode(id);
  };

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={ref} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        {children}
      </group>
    </group>
  );
}
