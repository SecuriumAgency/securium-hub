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

// Bâtiment commercial cliquable : son libellé (infobulle) et la page d'administration qu'il ouvre.
export type BuildingPlacement = Placement<BuildingModel> & { label: string; href: string };

export const GRID_MAP = {
  tile: 1,
  socle: { width: 16, depth: 12, thickness: 0.5 },
  // Vue de départ et cible de l'orbite : le centre du diorama, légèrement relevé.
  camera: { position: [9, 8, 9] as Vec3, fov: 40 },
  target: [0, 0.5, 0] as Vec3,
  // Axe de routes continu : 13 tuiles de x = -6 à x = 6, sur z = 0.
  roads: { z: 0, from: -6, to: 6 },
  // Voie du taxi : au centre de la chaussée (largeur 1). À l'échelle 0,55, sa carrosserie fait 0,83 de large :
  // elle tient dans la chaussée, sans déborder sur le trottoir. Il roule vers +x et repart de -6 quand il dépasse 6.
  traffic: { lane: 0, from: -6, to: 6, speed: 1.2, scale: 0.55, lift: 0 },
  // Rangée avant (z = -2), face à la route ; rangée arrière (z = -4), derrière.
  // Chaque immeuble ouvre une page d'administration existante.
  buildings: [
    { id: "immeuble-a-rue", label: "Parc Sites", href: "/admin/fleet", model: "building-a", x: -4, z: -2, rotation: 0 },
    { id: "immeuble-c-rue", label: "Lead Broker", href: "/admin/broker", model: "building-c", x: -2, z: -2, rotation: 0 },
    { id: "immeuble-a-rue-2", label: "Prospection", href: "/admin/outreach", model: "building-a", x: 5.5, z: -2, rotation: 0 },
    { id: "immeuble-c-fond", label: "Matchmaker", href: "/admin/broker/matchmaker", model: "building-c", x: -3, z: -4, rotation: 0 },
    { id: "immeuble-a-fond", label: "Audit SEO", href: "/admin/seo", model: "building-a", x: 0, z: -4, rotation: 0 },
    { id: "immeuble-c-fond-2", label: "Rapports", href: "/admin/reports", model: "building-c", x: 3.5, z: -4, rotation: 0 },
  ] as BuildingPlacement[],
  // Boutique (Mini Shop) : sol, vitrine et frigo, dans la rangée avant, à l'est des immeubles.
  // L'ensemble est un seul bâtiment cliquable, pivoté autour de son centre.
  shop: [
    { id: "boutique-sol", model: "floor", x: 1.5, z: -2, rotation: 0 },
    { id: "boutique-vitrine", model: "wall-window", x: 1.5, z: -2, rotation: 0 },
    { id: "boutique-frigo", model: "freezer", x: 3.2, z: -2.1, rotation: 0 },
  ] as Placement<ShopModel>[],
  shopSite: { id: "boutique", label: "Images locales", href: "/admin/image-studio", center: [2.1, 0, -2.05] as Vec3 },
  // Trottoirs : nord (z = -1, devant la rangée avant) et sud (z = 1, de l'autre côté de la route).
  // Échelle 0,45 : la taille d'un humain reste proche de celle d'une porte, et bien au-dessous de la voiture.
  characters: [
    { id: "pieton-1", model: "male", x: -3, z: -1, rotation: 0, scale: 0.45 },
    { id: "pieton-2", model: "female", x: 1, z: -1, rotation: 0, scale: 0.45 },
    { id: "pieton-3", model: "male", x: -1, z: 1, rotation: Math.PI, scale: 0.45 },
    { id: "pieton-4", model: "female", x: 4, z: 1, rotation: Math.PI, scale: 0.45 },
  ] as Placement<CharacterModel>[],
  // Coin parc, au sud-ouest : à 0,08, un animal reste plus petit qu'un humain (environ la taille d'une taille de personne).
  animals: [
    { id: "chat", model: "cat", x: -6.5, z: 3.5, rotation: Math.PI / 2, scale: 0.08, lift: 0 },
    { id: "chien", model: "dog", x: -5.5, z: 4.5, rotation: Math.PI, scale: 0.08, lift: 0 },
    { id: "lapin", model: "bunny", x: -7, z: 5, rotation: 0, scale: 0.08, lift: 0 },
  ] as Placement<AnimalModel>[],
} as const;
