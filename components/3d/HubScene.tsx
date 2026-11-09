"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
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
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [12, 12, 12], fov: 40 }}>
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
      <Environment preset="city" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -0.01, 2]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>

      <Diorama />

      <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.5} far={10} position={[0, 0, 0]} />
      <OrbitControls
        makeDefault
        enableDamping
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.2}
        maxDistance={30}
        target={[4, 0, 2]}
      />
    </Canvas>
  );
}
