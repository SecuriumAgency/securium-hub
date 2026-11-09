"use client";

import { useEffect, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useCursor } from "@react-three/drei";
import { MathUtils, type Group } from "three";
import { useHubStore, type TimeOfDay } from "@/store/useHubStore";
import AnimalBunny from "./assets/AnimalBunny";
import AnimalCat from "./assets/AnimalCat";
import AnimalDog from "./assets/AnimalDog";
import BuildingA from "./assets/BuildingA";
import BuildingC from "./assets/BuildingC";
import CharacterFemaleA from "./assets/CharacterFemaleA";
import CharacterMaleA from "./assets/CharacterMaleA";
import Floor from "./assets/Floor";
import Freezer from "./assets/Freezer";
import RoadStraight from "./assets/RoadStraight";
import WallWindow from "./assets/WallWindow";
import { DioramaIsland } from "./DioramaIsland";
import { IdleBreathing } from "./animations/IdleBreathing";
import type { BreathingOptions } from "./animations/useIdleBreathing";
import { TrafficController } from "./animations/TrafficController";
import { GRID_MAP, type AnimalModel, type BuildingModel, type CharacterModel, type Placement, type ShopModel, type Vec3 } from "./hubGrid";

type GroupProps = ComponentProps<"group">;
type OrbitLike = { target: { set: (x: number, y: number, z: number) => void }; update: () => void };

// Modèles gltfjsx, indexés par le nom qu'utilise le plan (hubGrid.ts).
const BUILDING_MODELS: Record<BuildingModel, ComponentType<GroupProps>> = { "building-a": BuildingA, "building-c": BuildingC };
const SHOP_MODELS: Record<ShopModel, ComponentType<GroupProps>> = { floor: Floor, "wall-window": WallWindow, freezer: Freezer };
const CHARACTER_MODELS: Record<CharacterModel, ComponentType<GroupProps>> = { male: CharacterMaleA, female: CharacterFemaleA };
const ANIMAL_MODELS: Record<AnimalModel, ComponentType<GroupProps>> = { cat: AnimalCat, dog: AnimalDog, bunny: AnimalBunny };

// Ambiance par moment de la journée : lumière blanche éclatante le jour, teintes bleutées et violettes la nuit.
const LIGHTS: Record<
  TimeOfDay,
  { ambient: string; ambientIntensity: number; sun: string; sunIntensity: number; background: string; sky: string; ground: string; hemisphere: number }
> = {
  jour: { ambient: "#ffffff", ambientIntensity: 0.6, sun: "#ffffff", sunIntensity: 1.5, background: "#f8fafc", sky: "#ffffff", ground: "#cbd5e1", hemisphere: 0.8 },
  nuit: { ambient: "#818cf8", ambientIntensity: 0.35, sun: "#c4b5fd", sunIntensity: 0.6, background: "#1e1b4b", sky: "#6366f1", ground: "#1e1b4b", hemisphere: 0.5 },
};

// HDRI locale, téléchargée par scripts/fetch-hub-env.mjs. Sans ce fichier, la scène n'appelle aucun CDN.
const HDRI_URL = "/models/env/city.hdr";

// Reflets d'environnement : la HDRI locale si le fichier existait au build (décidé par app/hub/page.tsx),
// sinon un éclairage de remplissage qui suit l'heure. Aucune requête réseau à l'exécution.
function EnvironmentLight({ timeOfDay, hdri }: { timeOfDay: TimeOfDay; hdri: boolean }) {
  if (hdri) return <Environment files={HDRI_URL} />;
  const light = LIGHTS[timeOfDay];
  return <hemisphereLight color={light.sky} groundColor={light.ground} intensity={light.hemisphere} />;
}

type OpenHandler = (href: string) => void;

// Bâtiment commercial interactif. Au survol : curseur pointeur, identifiant dans le store (infobulle de l'overlay),
// +5 % d'échelle. Au clic : navigation vers la page d'administration liée. Le pivot est le centre de l'ensemble.
function Interactive({
  id,
  href,
  position,
  rotation,
  onOpen,
  children,
}: {
  id: string;
  href: string;
  position: Vec3;
  rotation: number;
  onOpen: OpenHandler;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const setActiveNode = useHubStore((state) => state.setActiveNode);
  useCursor(hovered);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    group.scale.setScalar(MathUtils.damp(group.scale.x, hovered ? 1.05 : 1, 10, delta));
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
    onOpen(href);
  };

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={ref} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        {children}
      </group>
    </group>
  );
}

// Routes continues sur l'axe du plan : une tuile par case, de x = -6 à x = 6.
function Roads() {
  const { z, from, to } = GRID_MAP.roads;
  const xs = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  return (
    <group>
      {xs.map((x) => (
        <RoadStraight key={`route-${x}`} position={[x, 0, z]} rotation={[0, 0, 0]} />
      ))}
    </group>
  );
}

// Figurant ou animal posé sur sa case, qui respire doucement. L'échelle du plan s'applique à l'enveloppe externe.
function Figurant({
  placement,
  Model,
  breathing,
}: {
  placement: Placement<string>;
  Model: ComponentType<GroupProps>;
  breathing: BreathingOptions;
}) {
  return (
    <group position={[placement.x, placement.lift ?? 0, placement.z]} rotation={[0, placement.rotation, 0]} scale={placement.scale ?? 1}>
      <IdleBreathing {...breathing}>
        <Model />
      </IdleBreathing>
    </group>
  );
}

// Diorama posé sur le socle : routes, rangées de bâtiments, boutique, trottoirs, coin parc et taxi.
function Diorama({ onOpen }: { onOpen: OpenHandler }) {
  const [shopX, shopY, shopZ] = GRID_MAP.shopSite.center;
  return (
    <group>
      <Roads />

      {GRID_MAP.buildings.map((building) => {
        const Model = BUILDING_MODELS[building.model];
        return (
          <Interactive
            key={building.id}
            id={building.id}
            href={building.href}
            position={[building.x, 0, building.z]}
            rotation={building.rotation}
            onOpen={onOpen}
          >
            <Model />
          </Interactive>
        );
      })}

      {/* Mini Shop : sol, vitrine et frigo forment un seul bâtiment, pivoté autour de son centre. */}
      <Interactive
        id={GRID_MAP.shopSite.id}
        href={GRID_MAP.shopSite.href}
        position={[shopX, shopY, shopZ]}
        rotation={0}
        onOpen={onOpen}
      >
        {GRID_MAP.shop.map((item) => {
          const Model = SHOP_MODELS[item.model];
          return <Model key={item.id} position={[item.x - shopX, 0, item.z - shopZ]} rotation={[0, item.rotation, 0]} />;
        })}
      </Interactive>

      {GRID_MAP.characters.map((character, index) => (
        <Figurant
          key={character.id}
          placement={character}
          Model={CHARACTER_MODELS[character.model]}
          breathing={{ amplitude: 0.03, speed: 2, sway: 0.1, swaySpeed: 0.8, phase: index }}
        />
      ))}

      {GRID_MAP.animals.map((animal, index) => (
        <Figurant
          key={animal.id}
          placement={animal}
          Model={ANIMAL_MODELS[animal.model]}
          breathing={{ amplitude: 0.02, speed: 2.4, pulse: 0.03, phase: index * 1.3 }}
        />
      ))}

      <TrafficController />
    </group>
  );
}

// Relie la caméra au bouton « Réinitialiser la vue » : position de départ et cible du plan.
function ViewReset() {
  const viewVersion = useHubStore((state) => state.viewVersion);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitLike | null;

  useEffect(() => {
    if (viewVersion === 0) return;
    const [x, y, z] = GRID_MAP.camera.position;
    camera.position.set(x, y, z);
    controls?.target.set(...GRID_MAP.target);
    controls?.update();
  }, [viewVersion, camera, controls]);

  return null;
}

// Scène du hub : éclairage selon l'heure, socle ardoise, diorama sur le plan et contrôles de caméra.
// useRouter est appelé ici, dans l'arbre React du DOM : le Canvas R3F est un rendu séparé, qui n'a pas accès au contexte du routeur.
export function HubScene({ hdri = false }: { hdri?: boolean }) {
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const router = useRouter();
  const light = LIGHTS[timeOfDay];
  const { position, fov } = GRID_MAP.camera;
  const open: OpenHandler = (href) => router.push(href);

  // shadows="percentage" : PCFSoftShadowMap a été retiré de three r186 (avertissement en console).
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position, fov }}>
      <color attach="background" args={[light.background]} />
      <ambientLight color={light.ambient} intensity={light.ambientIntensity} />
      <directionalLight
        position={[15, 25, 15]}
        color={light.sun}
        castShadow
        intensity={light.sunIntensity}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <EnvironmentLight timeOfDay={timeOfDay} hdri={hdri} />

      <DioramaIsland />
      <Diorama onOpen={open} />

      {/* Ombres de contact posées sur la face supérieure du socle, à la taille de sa plus grande dimension. */}
      <ContactShadows position={[0, 0.002, 0]} scale={GRID_MAP.socle.width} resolution={1024} blur={2} opacity={0.5} far={2} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={6}
        maxDistance={30}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.2}
        target={GRID_MAP.target}
      />
      <ViewReset />
    </Canvas>
  );
}
