"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { CORE_DISTRICT_LAYOUT } from "@/lib/coreToolsMapping";
import type { CommercialModel } from "./village-layout";
import { InteractiveBuilding, type OpenHandler } from "./InteractiveBuilding";

// Bâtiment Kenney du quartier : une copie du modèle par outil, pour que chaque bâtiment reste cliquable et lumineux à part.
function CommercialBuilding({ model }: { model: CommercialModel }) {
  const { scene } = useGLTF(`/models/hub/commercial/${model}.glb`);
  const copy = useMemo(() => scene.clone(), [scene]);
  return <primitive object={copy} />;
}

// Quartier du QG : les outils du Securium Core posés dans les cases réservées autour du socle (village-layout.ts).
// Chaque bâtiment ouvre la page de son outil au second clic, et prend la couleur d'alerte de l'outil quand il est sélectionné.
export function CoreDistrict({ onOpen }: { onOpen: OpenHandler }) {
  return (
    <group>
      {CORE_DISTRICT_LAYOUT.map(({ tool, x, z }) => (
        <InteractiveBuilding key={tool.id} id={tool.nodeId} href={tool.href} position={[x, 0, z]} rotation={0} onOpen={onOpen} toolGlow={tool.colorGlow}>
          <CommercialBuilding model={tool.buildingModel} />
        </InteractiveBuilding>
      ))}
    </group>
  );
}
