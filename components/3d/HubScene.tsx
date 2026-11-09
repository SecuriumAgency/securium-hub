"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Leva, useControls } from "leva";
import { MathUtils } from "three";
import BuildingA from "./assets/BuildingA";
import BuildingC from "./assets/BuildingC";
import AnimalBunny from "./assets/AnimalBunny";
import AnimalCat from "./assets/AnimalCat";
import AnimalDog from "./assets/AnimalDog";
import CharacterFemaleA from "./assets/CharacterFemaleA";
import CharacterMaleA from "./assets/CharacterMaleA";
import Floor from "./assets/Floor";
import Freezer from "./assets/Freezer";
import RoadCrossroad from "./assets/RoadCrossroad";
import RoadCurve from "./assets/RoadCurve";
import RoadEnd from "./assets/RoadEnd";
import RoadStraight from "./assets/RoadStraight";
import Sedan from "./assets/Sedan";
import Taxi from "./assets/Taxi";
import WallWindow from "./assets/WallWindow";

const QUARTER = Math.PI / 2;
// HDRI locale, téléchargée par scripts/fetch-hub-env.mjs. Sans ce fichier, la scène n'appelle aucun CDN.
const HDRI_URL = "/models/env/city.hdr";

// Éclairage d'environnement : la HDRI locale si elle existe (reflets sur les vitrines et les carrosseries),
// sinon un éclairage de remplissage directionnel. Le test se fait en HEAD, sans suivre de redirection :
// un visiteur sans session obtient « absent » au lieu de la page de connexion.
function EnvironmentLight() {
  const [hdri, setHdri] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(HDRI_URL, { method: "HEAD", redirect: "error", signal: controller.signal })
      .then((response) => setHdri(response.ok))
      .catch(() => setHdri(false));
    return () => controller.abort();
  }, []);

  if (hdri) return <Environment files={HDRI_URL} />;
  return (
    <>
      <hemisphereLight args={["#ffffff", "#cbd5e1", 0.8]} />
      <directionalLight position={[-10, 8, -6]} intensity={0.4} />
    </>
  );
}

// Diorama du hub : une boucle de routes autour d'un immeuble, une petite boutique, des véhicules,
// des personnages et des animaux. Les coordonnées sont en tuiles (une tuile = une unité de scène).
function Diorama() {
  return (
    <group>
      {/* Boucle de routes 5 x 5 : quatre virages aux angles, des lignes droites sur chaque côté. */}
      <RoadCurve position={[0, 0, 0]} rotation={[0, 0, 0]} />
      <RoadCurve position={[4, 0, 0]} rotation={[0, -QUARTER, 0]} />
      <RoadCurve position={[4, 0, 4]} rotation={[0, Math.PI, 0]} />
      <RoadCurve position={[0, 0, 4]} rotation={[0, QUARTER, 0]} />
      {[1, 2, 3].map((x) => (
        <RoadStraight key={`n${x}`} position={[x, 0, 0]} rotation={[0, 0, 0]} />
      ))}
      {[1, 2, 3].map((x) => (
        <RoadStraight key={`s${x}`} position={[x, 0, 4]} rotation={[0, 0, 0]} />
      ))}
      {[1, 2, 3].map((z) => (
        <RoadStraight key={`w${z}`} position={[0, 0, z]} rotation={[0, QUARTER, 0]} />
      ))}
      {[1, 2, 3].map((z) => (
        <RoadStraight key={`e${z}`} position={[4, 0, z]} rotation={[0, QUARTER, 0]} />
      ))}
      <RoadCrossroad position={[8, 0, 0]} rotation={[0, 0, 0]} />
      <RoadEnd position={[8, 0, 4]} rotation={[0, 0, 0]} />

      {/* Immeuble au centre de la boucle et bâtiment de l'autre côté de la route. */}
      <BuildingA position={[2, 0, 2]} rotation={[0, 0, 0]} />
      <BuildingC position={[6, 0, 2]} rotation={[0, -QUARTER, 0]} />

      {/* Petite boutique : sol, vitrine et frigo. */}
      <Floor position={[10, 0, 2]} rotation={[0, 0, 0]} />
      <WallWindow position={[10, 0, 1]} rotation={[0, 0, 0]} />
      <Freezer position={[9, 0, 3]} rotation={[0, 0, 0]} />

      {/* Véhicules sur la route. */}
      <Sedan position={[1.5, 0, 0]} rotation={[0, 0, 0]} />
      <Taxi position={[4, 0, 2.5]} rotation={[0, QUARTER, 0]} />

      {/* Personnages et animaux sur la place. */}
      <CharacterMaleA position={[1.2, 0, 3.4]} rotation={[0, 0, 0]} />
      <CharacterFemaleA position={[2.8, 0, 3.4]} rotation={[0, 0, 0]} />
      <AnimalCat position={[1, 0, 1]} rotation={[0, QUARTER, 0]} />
      <AnimalDog position={[3.2, 0, 1.2]} rotation={[0, Math.PI, 0]} />
      <AnimalBunny position={[2.6, 0, 0.6]} rotation={[0, 0, 0]} />
    </group>
  );
}

// Scène du hub : éclairage homogène, ombres douces, reflets d'environnement et contrôles de caméra.
export function HubScene() {
  // TODO(leva) : retirer leva (ce bloc, le composant Leva et la dépendance) une fois les valeurs de production fixées.
  const camera = useControls("Caméra", {
    x: { value: 12, step: 0.1 },
    y: { value: 12, step: 0.1 },
    z: { value: 12, step: 0.1 },
    fov: { value: 40, min: 10, max: 120, step: 1 },
    targetX: { value: 4, step: 0.1, label: "cible x" },
    targetY: { value: 0, step: 0.1, label: "cible y" },
    targetZ: { value: 2, step: 0.1, label: "cible z" },
  });
  const diorama = useControls("Diorama", {
    x: { value: 0, step: 0.1 },
    y: { value: 0, step: 0.1 },
    z: { value: 0, step: 0.1 },
    rotation: { value: 0, min: -180, max: 180, step: 1, label: "rotation Y (°)" },
  });
  const aids = useControls("Aides", {
    axesHelper: { value: false, label: "repère (axes)" },
    gridHelper: { value: false, label: "grille 20 x 20" },
  });

  return (
    <>
      {/* Panneau masqué en production : il ne sert qu'aux réglages en développement. */}
      <Leva collapsed hidden={process.env.NODE_ENV === "production"} />
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[camera.x, camera.y, camera.z]} fov={camera.fov} />
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[15, 25, 15]}
          castShadow
          intensity={1.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={50}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <EnvironmentLight />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -0.01, 2]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>

        <group
          position={[diorama.x, diorama.y, diorama.z]}
          rotation={[0, MathUtils.degToRad(diorama.rotation), 0]}
        >
          <Diorama />
        </group>

        {aids.axesHelper && <axesHelper args={[5]} />}
        {aids.gridHelper && <gridHelper args={[20, 20]} />}

        <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.5} far={10} position={[0, 0, 0]} />
        <OrbitControls
          makeDefault
          enableDamping
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.2}
          maxDistance={30}
          target={[camera.targetX, camera.targetY, camera.targetZ]}
        />
      </Canvas>
    </>
  );
}
