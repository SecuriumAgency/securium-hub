"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { pm2Health } from "@/lib/telemetry";
import { getTelemetryState } from "@/lib/use-telemetry";
import { useHubStore } from "@/store/useHubStore";
import { MovingKit, type Tint } from "./InstancedKit";
import { CAR_MODELS, PET_MODELS, createSimulation, type Simulation, type WorldView } from "./urban-simulation";
import { GRAPH, NOC_NODES, PERSON_MODELS, SIGNAL_NODES, signalState, type Light } from "./village-layout";

// Ville vivante, rendue : les états vivent dans la simulation (urban-simulation.ts), la boucle d'images met à jour
// les poses, et les ensembles instanciés les recopient dans leurs matrices. Ce fichier ne fait que fournir le monde.

// Monde lu à chaque image depuis le store et le rapport de télémétrie. Aucun abonnement React : pas de re-rendu.
function readWorld(): WorldView {
  const state = useHubStore.getState();
  // Nœuds en alerte : ceux des bâtiments dont le site est hors ligne ou en maintenance.
  const forbiddenNodes = new Set<string>();
  for (const site of state.sitesNetwork) {
    if (site.status !== "online" && NOC_NODES[site.id]) forbiddenNodes.add(NOC_NODES[site.id]);
  }
  return {
    night: state.timeOfDay === "nuit",
    health: pm2Health(getTelemetryState().data),
    unseenLeads: state.unseenLeads,
    forbiddenNodes,
    log: state.addLog,
  };
}

// Lueur violette du PNJ Prospect, pour le reconnaître dans la foule.
const PROSPECT_TINT: Tint = { color: "#a78bfa", intensity: 0.45 };
const PROSPECT_MODEL = "female-b";

// Feux : un poteau par carrefour, deux lampes côte à côte (axe est-ouest à gauche, nord-sud à droite).
const CORNER = 0.7;
const POLE_GEOMETRY = new BoxGeometry(0.07, 0.9, 0.07);
const POLE_MATERIAL = new MeshStandardMaterial({ color: "#334155" });
const LAMP_GEOMETRY = new BoxGeometry(0.2, 0.2, 0.2);
const LAMP_MATERIAL = new MeshBasicMaterial({ toneMapped: false });
const LIGHT_COLOR: Record<Light, Color> = {
  green: new Color("#22c55e"),
  amber: new Color("#f59e0b"),
  red: new Color("#ef4444"),
};

function SignalHeads({ sim }: { sim: Simulation }) {
  const { poles, lamps } = useMemo(() => {
    const matrix = new Matrix4();
    const poles = new InstancedMesh(POLE_GEOMETRY, POLE_MATERIAL, SIGNAL_NODES.length);
    const lamps = new InstancedMesh(LAMP_GEOMETRY, LAMP_MATERIAL, SIGNAL_NODES.length * 2);
    SIGNAL_NODES.forEach((node, index) => {
      const { x, z } = GRAPH.nodes[node];
      poles.setMatrixAt(index, matrix.makeTranslation(x + CORNER, 0.45, z + CORNER));
      lamps.setMatrixAt(index * 2, matrix.makeTranslation(x + CORNER - 0.12, 1.0, z + CORNER));
      lamps.setMatrixAt(index * 2 + 1, matrix.makeTranslation(x + CORNER + 0.12, 1.0, z + CORNER));
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    return { poles, lamps };
  }, []);

  // Couleur des lampes selon le cycle de la simulation : les véhicules et les lampes lisent le même temps.
  useFrame(() => {
    SIGNAL_NODES.forEach((node, index) => {
      lamps.setColorAt(index * 2, LIGHT_COLOR[signalState(node, "h", sim.time)]);
      lamps.setColorAt(index * 2 + 1, LIGHT_COLOR[signalState(node, "v", sim.time)]);
    });
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <primitive object={poles} />
      <primitive object={lamps} />
    </>
  );
}

export function UrbanLifeSimulation() {
  const sim = useMemo(() => createSimulation(readWorld), []);
  useFrame((_, delta) => sim.update(Math.min(delta, 0.05)));

  return (
    <group>
      {CAR_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/cars/${model}.glb`} poses={sim.cars[model] ?? []} />
      ))}
      {PERSON_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/characters/character-${model}.glb`} poses={sim.walkers[model] ?? []} />
      ))}
      <MovingKit url={`/models/hub/characters/character-${PROSPECT_MODEL}.glb`} poses={sim.prospects} tint={PROSPECT_TINT} />
      {PET_MODELS.map((model) => (
        <MovingKit key={model} url={`/models/hub/pets/animal-${model}.glb`} poses={sim.pets[model] ?? []} />
      ))}
      <SignalHeads sim={sim} />
    </group>
  );
}
