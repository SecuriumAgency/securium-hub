// Plan du diorama du hub. Une tuile = 1 unité, la taille native des routes Kenney.
// Rien n'est posé en [0, 0, 0] : chaque objet a sa case réservée et les rangées ne se chevauchent pas.
// Le socle couvre x de -8 à 8 et z de -6 à 6. Axes : x horizontal, z vers l'avant (la route est sur z = 0).

// Affectation bâtiment → site du réseau : clé = identifiant du bâtiment dans GRID_MAP.buildings, valeur = identifiant
// du site dans lib/mock-data.json. Un bâtiment absent de cette table n'a pas de site : son statut reste inconnu.
// Affectations à valider : elles ne sont qu'une donnée d'affichage, à modifier ici sans toucher à la logique.
export const SITE_MAPPING: Readonly<Record<string, string>> = {
  "immeuble-a-rue": "securium-agency",
  "immeuble-c-rue": "securium-labs",
  "immeuble-a-rue-2": "elite-depannage-34",
  "immeuble-c-fond": "rescue-247-uk",
  "immeuble-a-fond": "geoenergy-habitat",
};

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
  // Carrefour central du socle : une rue au nord (z -1 à -3) et une au sud (z 1 à 4), chacune en cul-de-sac.
  // Le réseau complet (rues, quartiers, parcs) est généré dans village-layout.ts, qui prolonge cet axe.
  roads: { z: 0, from: -6, to: 6, cross: { x: 0, north: -3, south: 4 } },
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
  // Les humains, les véhicules et les animaux ne sont plus posés ici : ils vivent dans UrbanLifeSimulation.tsx.
} as const;
