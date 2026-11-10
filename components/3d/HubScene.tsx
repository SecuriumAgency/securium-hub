"use client";

import { useEffect, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useCursor } from "@react-three/drei";
import { MathUtils, Mesh, MeshStandardMaterial, Vector3, type Group } from "three";
import { useHubStore, type SiteStatus, type TimeOfDay } from "@/store/useHubStore";
import BuildingA from "./assets/BuildingA";
import BuildingC from "./assets/BuildingC";
import Floor from "./assets/Floor";
import Freezer from "./assets/Freezer";
import WallWindow from "./assets/WallWindow";
import { DioramaIsland } from "./DioramaIsland";
import { CityEnvironment } from "./CityEnvironment";
import { UrbanLifeSimulation } from "./UrbanLifeSimulation";
import { GRID_MAP, PROSPECT_BUILDING_ID, type BuildingModel, type ShopModel, type Vec3 } from "./hubGrid";

type GroupProps = ComponentProps<"group">;
type OrbitTarget = { target: Vector3; update: () => void };

// Modèles gltfjsx des bâtiments du NOC, indexés par le nom qu'utilise le plan (hubGrid.ts).
const BUILDING_MODELS: Record<BuildingModel, ComponentType<GroupProps>> = { "building-a": BuildingA, "building-c": BuildingC };
const SHOP_MODELS: Record<ShopModel, ComponentType<GroupProps>> = { floor: Floor, "wall-window": WallWindow, freezer: Freezer };

// Ambiance par moment de la journée : lumière blanche éclatante le jour, teintes bleutées et violettes la nuit.
const LIGHTS: Record<
  TimeOfDay,
  { ambient: string; ambientIntensity: number; sun: string; sunIntensity: number; background: string; sky: string; ground: string; hemisphere: number }
> = {
  jour: { ambient: "#ffffff", ambientIntensity: 0.6, sun: "#ffffff", sunIntensity: 1.5, background: "#f8fafc", sky: "#ffffff", ground: "#cbd5e1", hemisphere: 0.8 },
  nuit: { ambient: "#818cf8", ambientIntensity: 0.35, sun: "#c4b5fd", sunIntensity: 0.6, background: "#1e1b4b", sky: "#6366f1", ground: "#1e1b4b", hemisphere: 0.5 },
};

// Lueur par état, dans l'ordre de priorité : alerte du site, lead en attente, sélection, fenêtres allumées la nuit, sinon aucune.
const ALERT_GLOW: Record<SiteStatus, { color: string; intensity: number }> = {
  online: { color: "#000000", intensity: 0 },
  maintenance: { color: "#f59e0b", intensity: 0.4 },
  offline: { color: "#ef4444", intensity: 0.4 },
};
const SELECTED_GLOW = { color: "#22d3ee", intensity: 0.35 };
// Bâtiment de prospection avec un lead non vu : violet, qui pulse (voir la boucle d'images d'Interactive).
const LEAD_GLOW = { color: "#a78bfa", intensity: 0.3 };
// Demande B2B qui attend un audit : ambre, plus prioritaire que le violet des leads.
const B2B_GLOW = { color: "#f59e0b", intensity: 0.3 };
const WINDOW_GLOW = { color: "#fbbf24", intensity: 0.12 };

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

type OpenHandler = (href: string) => void;

// Bâtiment commercial interactif. Au survol : curseur pointeur, identifiant dans le store (infobulle de l'overlay),
// +5 % d'échelle. Premier clic : sélection (la caméra s'approche, la barre surligne). Second clic : page admin liée.
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
  const status = useHubStore((state) => state.sitesNetwork.find((site) => site.id === id)?.status ?? "online");
  const selected = useHubStore((state) => state.selectedNode === id);
  const timeOfDay = useHubStore((state) => state.timeOfDay);
  const leadAlert = useHubStore((state) => id === PROSPECT_BUILDING_ID && state.unseenLeads > 0);
  const b2bAlert = useHubStore(
    (state) => id === PROSPECT_BUILDING_ID && state.b2bProspects.some((item) => item.status === "À auditer"),
  );
  const pulsing = leadAlert || b2bAlert;
  const glow =
    status !== "online"
      ? ALERT_GLOW[status]
      : b2bAlert
        ? B2B_GLOW
        : leadAlert
          ? LEAD_GLOW
          : selected
          ? SELECTED_GLOW
          : timeOfDay === "nuit"
            ? WINDOW_GLOW
            : ALERT_GLOW.online;
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

// Diorama du NOC : bâtiments interactifs, boutique et ville vivante. Le village statique est dans CityEnvironment.
function Diorama({ onOpen }: { onOpen: OpenHandler }) {
  const [shopX, shopY, shopZ] = GRID_MAP.shopSite.center;
  return (
    <group>
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

// Centre d'un nœud du plan : bâtiment ou boutique, à hauteur de la cible de l'orbite.
function nodePosition(id: string): Vec3 | null {
  if (id === GRID_MAP.shopSite.id) return [GRID_MAP.shopSite.center[0], 0.5, GRID_MAP.shopSite.center[2]];
  const building = GRID_MAP.buildings.find((item) => item.id === id);
  return building ? [building.x, 0.5, building.z] : null;
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

// Scène du hub : éclairage selon l'heure, dalle verte, socle ardoise, village et contrôles de caméra.
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
      <color attach="background" args={[light.background]} />
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
