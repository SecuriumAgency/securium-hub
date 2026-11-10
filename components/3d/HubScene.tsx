"use client";

import { useEffect, useRef, type ComponentProps, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { useHubStore, type TimeOfDay } from "@/store/useHubStore";
import { CORE_DISTRICT_LAYOUT, toolForNode } from "@/lib/coreToolsMapping";
import BuildingA from "./assets/BuildingA";
import BuildingC from "./assets/BuildingC";
import Floor from "./assets/Floor";
import Freezer from "./assets/Freezer";
import WallWindow from "./assets/WallWindow";
import { DioramaIsland } from "./DioramaIsland";
import { CityEnvironment } from "./CityEnvironment";
import { CoreDistrict } from "./CoreDistrict";
import { InteractiveBuilding, type OpenHandler } from "./InteractiveBuilding";
import { UrbanLifeSimulation } from "./UrbanLifeSimulation";
import { GRID_MAP, type BuildingModel, type ShopModel, type Vec3 } from "./hubGrid";

type GroupProps = ComponentProps<"group">;
type OrbitTarget = { target: Vector3; update: () => void };

// Modèles gltfjsx des bâtiments du NOC, indexés par le nom qu'utilise le plan (hubGrid.ts).
const BUILDING_MODELS: Record<BuildingModel, ComponentType<GroupProps>> = { "building-a": BuildingA, "building-c": BuildingC };
const SHOP_MODELS: Record<ShopModel, ComponentType<GroupProps>> = { floor: Floor, "wall-window": WallWindow, freezer: Freezer };

// Ambiance par moment de la journée. Le fond et le brouillard partagent la même couleur : l'horizon se fond dans l'air,
// et le bord de la grille (±64) disparaît sans coupure. Jour : gris clair ; nuit : indigo sombre.
const LIGHTS: Record<
  TimeOfDay,
  { ambient: string; ambientIntensity: number; sun: string; sunIntensity: number; background: string; sky: string; ground: string; hemisphere: number }
> = {
  jour: { ambient: "#ffffff", ambientIntensity: 0.6, sun: "#ffffff", sunIntensity: 1.5, background: "#dfe6ee", sky: "#ffffff", ground: "#cbd5e1", hemisphere: 0.8 },
  nuit: { ambient: "#818cf8", ambientIntensity: 0.35, sun: "#c4b5fd", sunIntensity: 0.6, background: "#1e1b4b", sky: "#6366f1", ground: "#1e1b4b", hemisphere: 0.5 },
};

// Brouillard : net près du centre, opaque au-delà de la zone bâtie (la dalle s'étend à ±75).
const FOG_NEAR = 34;
const FOG_FAR = 95;

// Distance de la caméra à la cible lors d'un focus sur un bâtiment.
const FOCUS_OFFSET: Vec3 = [4, 5, 4];

// HDRI locale (CC0), téléchargée une fois par scripts/fetch-hub-env.mjs. La scène ne lit jamais un CDN.
const HDRI_URL = "/models/env/city.hdr";

// Reflets d'environnement : la HDRI locale si le fichier existait au build (décidé par app/hub/page.tsx),
// sinon un éclairage de remplissage qui suit l'heure. Aucune requête réseau à l'exécution.
function EnvironmentLight({ timeOfDay, hdri }: { timeOfDay: TimeOfDay; hdri: boolean }) {
  // La nuit, les reflets de la HDRI sont réduits : sinon la lumière du jour persiste dans l'ambiance nocturne.
  if (hdri) return <Environment files={HDRI_URL} environmentIntensity={timeOfDay === "nuit" ? 0.3 : 1} />;
  const light = LIGHTS[timeOfDay];
  return <hemisphereLight color={light.sky} groundColor={light.ground} intensity={light.hemisphere} />;
}

// Diorama du NOC : bâtiments interactifs, boutique et ville vivante. Le village statique est dans CityEnvironment.
function Diorama({ onOpen }: { onOpen: OpenHandler }) {
  const [shopX, shopY, shopZ] = GRID_MAP.shopSite.center;
  return (
    <group>
      {GRID_MAP.buildings.map((building) => {
        const Model = BUILDING_MODELS[building.model];
        return (
          <InteractiveBuilding
            key={building.id}
            id={building.id}
            href={building.href}
            position={[building.x, 0, building.z]}
            rotation={building.rotation}
            onOpen={onOpen}
            toolGlow={toolForNode(building.id)?.colorGlow}
          >
            <Model />
          </InteractiveBuilding>
        );
      })}

      {/* Mini Shop : sol, vitrine et frigo forment un seul bâtiment, pivoté autour de son centre. */}
      <InteractiveBuilding
        id={GRID_MAP.shopSite.id}
        href={GRID_MAP.shopSite.href}
        position={[shopX, shopY, shopZ]}
        rotation={0}
        onOpen={onOpen}
        toolGlow={toolForNode(GRID_MAP.shopSite.id)?.colorGlow}
      >
        {GRID_MAP.shop.map((item) => {
          const Model = SHOP_MODELS[item.model];
          return <Model key={item.id} position={[item.x - shopX, 0, item.z - shopZ]} rotation={[0, item.rotation, 0]} />;
        })}
      </InteractiveBuilding>

      <UrbanLifeSimulation />
    </group>
  );
}

// Relie la caméra au bouton « Réinitialiser la vue » : position de départ et cible du plan.
function ViewReset() {
  const viewVersion = useHubStore((state) => state.viewVersion);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitTarget | null;

  useEffect(() => {
    if (viewVersion === 0) return;
    const [x, y, z] = GRID_MAP.camera.position;
    camera.position.set(x, y, z);
    controls?.target.set(...GRID_MAP.target);
    controls?.update();
  }, [viewVersion, camera, controls]);

  return null;
}

// Centre d'un nœud : bâtiment, boutique, ou bâtiment du quartier du QG, à hauteur de la cible de l'orbite.
function nodePosition(id: string): Vec3 | null {
  if (id === GRID_MAP.shopSite.id) return [GRID_MAP.shopSite.center[0], 0.5, GRID_MAP.shopSite.center[2]];
  const building = GRID_MAP.buildings.find((item) => item.id === id);
  if (building) return [building.x, 0.5, building.z];
  const district = CORE_DISTRICT_LAYOUT.find((item) => item.tool.nodeId === id);
  return district ? [district.x, 0.5, district.z] : null;
}

// Un nœud sélectionné attire la caméra. Le mouvement s'arrête à la cible, pour que l'orbite reste libre ensuite.
function CameraFocus() {
  const selectedNode = useHubStore((state) => state.selectedNode);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitTarget | null;
  const focus = useRef({ active: false, target: new Vector3(), view: new Vector3() });

  useEffect(() => {
    const position = selectedNode ? nodePosition(selectedNode) : null;
    if (!position) return;
    focus.current.target.set(position[0], position[1], position[2]);
    focus.current.view.set(position[0] + FOCUS_OFFSET[0], position[1] + FOCUS_OFFSET[1], position[2] + FOCUS_OFFSET[2]);
    focus.current.active = true;
  }, [selectedNode]);

  useFrame((_, delta) => {
    const state = focus.current;
    if (!state.active || !controls) return;
    const k = 1 - Math.exp(-4 * delta);
    controls.target.lerp(state.target, k);
    camera.position.lerp(state.view, k);
    controls.update();
    if (controls.target.distanceTo(state.target) < 0.01 && camera.position.distanceTo(state.view) < 0.05) state.active = false;
  });

  return null;
}

// Scène du hub : éclairage et brouillard selon l'heure, dalle verte, socle ardoise, village et contrôles de caméra.
// useRouter est appelé ici, dans l'arbre React du DOM : le Canvas R3F est un rendu séparé, qui n'a pas accès au contexte du routeur.
export function HubScene({ hdri = false }: { hdri?: boolean }) {
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const router = useRouter();
  const light = LIGHTS[timeOfDay];
  const { position, fov } = GRID_MAP.camera;
  const open: OpenHandler = (href) => router.push(href);

  // shadows="percentage" : PCFSoftShadowMap a été retiré de three r186 (avertissement en console).
  return (
    <Canvas className="absolute inset-0 w-full h-full z-0" shadows="percentage" dpr={[1, 2]} camera={{ position, fov }}>
      {/* Fond et brouillard : même couleur, pour que la limite du plan se fonde dans l'horizon. */}
      <color attach="background" args={[light.background]} />
      <fog attach="fog" args={[light.background, FOG_NEAR, FOG_FAR]} />
      <ambientLight color={light.ambient} intensity={light.ambientIntensity} />
      <directionalLight
        position={[10, 20, 10]}
        color={light.sun}
        castShadow
        intensity={light.sunIntensity}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={90}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <EnvironmentLight timeOfDay={timeOfDay} hdri={hdri} />

      {/* Dalle verte : le village s'étend dessus, jusqu'aux bords. Sous la face supérieure du socle (y = 0). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[150, 150]} />
        <meshStandardMaterial color="#4ade80" />
      </mesh>

      <DioramaIsland />
      <CityEnvironment night={timeOfDay === "nuit"} />
      <Diorama onOpen={open} />
      <CoreDistrict onOpen={open} />

      {/* Ombres de contact posées sur la dalle, à la taille de la zone bâtie. */}
      <ContactShadows position={[0, 0.002, 0]} scale={GRID_MAP.socle.width} resolution={1024} blur={2} opacity={0.5} far={2} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={6}
        maxDistance={80}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.2}
        target={GRID_MAP.target}
      />
      <ViewReset />
      <CameraFocus />
    </Canvas>
  );
}
