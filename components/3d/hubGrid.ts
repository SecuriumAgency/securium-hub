// Plan du diorama du hub. Une tuile = 1 unité, la taille native des routes Kenney.
// Rien n'est posé en [0, 0, 0] : chaque objet a sa case réservée et les rangées ne se chevauchent pas.
// Le socle couvre x de -8 à 8 et z de -6 à 6. Axes : x horizontal, z vers l'avant (la route est sur z = 0).

export type Vec3 = [number, number, number];

export type BuildingModel = "building-a" | "building-c";
export type ShopModel = "floor" | "wall-window" | "freezer";
export type CharacterModel = "male" | "female";
export type AnimalModel = "cat" | "dog" | "bunny";

export type Placement<Model extends string> = {
  id: string;
  model: Model;
  x: number;
  z: number;
  rotation: number;
  scale?: number;
  // Décalage vertical, pour poser le modèle à l'échelle : le pied ou la roue touche le sol.
  lift?: number;
};

export type BuildingPlacement = Placement<BuildingModel> & { label: string };

export const GRID_MAP = {
  tile: 1,
  socle: { width: 16, depth: 12, thickness: 0.5 },
  // Vue de départ et cible de l'orbite : le centre du diorama, légèrement relevé.
  camera: { position: [9, 8, 9] as Vec3, fov: 40 },
  target: [0, 0.5, 0] as Vec3,
  // Axe de routes continu : 13 tuiles de x = -6 à x = 6, sur z = 0.
  roads: { z: 0, from: -6, to: 6 },
  // Voie du taxi : au centre de la chaussée (largeur 1), il roule vers +x et repart de -6 quand il dépasse 6.
  traffic: { lane: 0, from: -6, to: 6, speed: 1.2, scale: 0.8, lift: 0 },
  // Rangée avant (z = -2), face à la route ; rangée arrière (z = -4), derrière.
  buildings: [
    { id: "immeuble-a-rue", label: "Immeuble A · rue", model: "building-a", x: -4, z: -2, rotation: 0 },
    { id: "immeuble-c-rue", label: "Immeuble C · rue", model: "building-c", x: -2, z: -2, rotation: 0 },
    { id: "immeuble-a-rue-2", label: "Immeuble A · rue est", model: "building-a", x: 5.5, z: -2, rotation: 0 },
    { id: "immeuble-c-fond", label: "Immeuble C · fond", model: "building-c", x: -3, z: -4, rotation: 0 },
    { id: "immeuble-a-fond", label: "Immeuble A · fond", model: "building-a", x: 0, z: -4, rotation: 0 },
    { id: "immeuble-c-fond-2", label: "Immeuble C · fond est", model: "building-c", x: 3.5, z: -4, rotation: 0 },
  ] as BuildingPlacement[],
  // Boutique : sol, vitrine et frigo, dans la rangée avant, à l'est des immeubles.
  shop: [
    { id: "boutique-sol", model: "floor", x: 1.5, z: -2, rotation: 0 },
    { id: "boutique-vitrine", model: "wall-window", x: 1.5, z: -2, rotation: 0 },
    { id: "boutique-frigo", model: "freezer", x: 3.2, z: -2.1, rotation: 0 },
  ] as Placement<ShopModel>[],
  // Trottoirs : nord (z = -1, devant la rangée avant) et sud (z = 1, de l'autre côté de la route).
  characters: [
    { id: "pieton-1", model: "male", x: -3, z: -1, rotation: 0, scale: 0.35 },
    { id: "pieton-2", model: "female", x: 1, z: -1, rotation: 0, scale: 0.35 },
    { id: "pieton-3", model: "male", x: -1, z: 1, rotation: Math.PI, scale: 0.35 },
    { id: "pieton-4", model: "female", x: 4, z: 1, rotation: Math.PI, scale: 0.35 },
  ] as Placement<CharacterModel>[],
  // Coin parc, au sud-ouest : les animaux restent à l'écart des routes et des bâtiments.
  animals: [
    { id: "chat", model: "cat", x: -6.5, z: 3.5, rotation: Math.PI / 2, scale: 0.08, lift: 0 },
    { id: "chien", model: "dog", x: -5.5, z: 4.5, rotation: Math.PI, scale: 0.08, lift: 0 },
    { id: "lapin", model: "bunny", x: -7, z: 5, rotation: 0, scale: 0.08, lift: 0 },
  ] as Placement<AnimalModel>[],
} as const;
