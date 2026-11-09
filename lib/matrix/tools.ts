import {
  Bot,
  Box,
  CalendarDays,
  Clapperboard,
  Coins,
  ExternalLink,
  FileText,
  FlaskConical,
  Factory,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  Monitor,
  Search,
  Target,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { initialSites } from "@/lib/sites";

export type Vec3 = [number, number, number];
export type ZoneId = "cerveau" | "usines" | "ia" | "qg" | "reseau";
// Types de bâtiments du village : hôpital (sécurité), salle de sport (acquisition), mosquée (stratégie),
// hôtel (outils au repos), maison (sites clients).
export type Shape = "hospital" | "gym" | "mosque" | "hotel" | "house";

// Quartiers du village, de taille [largeur x, profondeur z]. Sert aux libellés du HUD.
export const ZONES: Record<ZoneId, { label: string; color: string; center: Vec3; size: [number, number] }> = {
  cerveau: { label: "Cerveau & Ops", color: "#a78bfa", center: [0, 0, -2.5], size: [11, 10] },
  usines: { label: "Usines d'acquisition", color: "#22d3ee", center: [-10, 0, 0], size: [7, 12] },
  ia: { label: "Pôle IA & création", color: "#f472b6", center: [10, 0, 0], size: [7, 12] },
  qg: { label: "Commandement & data", color: "#fbbf24", center: [0, 0, 9], size: [17, 5] },
  reseau: { label: "Réseau & Parc Sites", color: "#34d399", center: [0, 0, -12], size: [21, 6] },
};

export type MatrixTool = {
  id: string;
  label: string;
  description: string;
  href: string;
  external?: boolean;
  zone: ZoneId;
  shape: Shape;
  icon: LucideIcon;
  color: string;
  position: Vec3;
  // Pilote automatique réglable depuis le HUD : seul le Parc Sites déclenche des réparations.
  autopilot?: boolean;
  // Tour centrale : point de départ de tous les flux de l'Orchestrateur.
  central?: boolean;
};

// Les 18 entrées de la barre admin (components/admin/AdminNav.tsx), chacune avec son bâtiment.
export const MATRIX_TOOLS: MatrixTool[] = [
  { id: "securium-os", label: "Securium OS", description: "Tour centrale : agents du poste et orchestration.", href: "/admin/agents#poste", zone: "cerveau", shape: "mosque", icon: Monitor, color: "#a78bfa", position: [0, 0, 0], central: true },
  { id: "batcave", label: "Batcave", description: "Tableau de bord de commande.", href: "/admin/command", zone: "cerveau", shape: "mosque", icon: LayoutDashboard, color: "#a78bfa", position: [-3.5, 0, -1.5] },
  { id: "hub-3d", label: "Hub 3D", description: "Vue 3D de la flotte des sites.", href: "/", zone: "cerveau", shape: "hotel", icon: Box, color: "#a78bfa", position: [3.5, 0, -1.5] },
  { id: "ecosystem", label: "Écosystème", description: "Modules de l'agence, reliés au Hub.", href: "/admin/ecosystem", zone: "cerveau", shape: "hotel", icon: Layers, color: "#a78bfa", position: [0, 0, -4.5] },
  { id: "prospection", label: "Prospection", description: "Recherche et envoi des prospects.", href: "/admin/outreach", zone: "usines", shape: "gym", icon: Target, color: "#22d3ee", position: [-12, 0, -4] },
  { id: "osint", label: "OSINT", description: "Collecte de données externes.", href: "/admin/osint", zone: "usines", shape: "hotel", icon: Globe, color: "#22d3ee", position: [-12, 0, 0] },
  { id: "lead-broker", label: "Lead Broker", description: "Vente et attribution des leads.", href: "/admin/broker", zone: "usines", shape: "hotel", icon: Coins, color: "#22d3ee", position: [-12, 0, 4] },
  { id: "matchmaker", label: "Matchmaker", description: "Appariement des leads avec les artisans.", href: "/admin/broker/matchmaker", zone: "usines", shape: "gym", icon: Users, color: "#22d3ee", position: [-7, 0, 0] },
  { id: "reels", label: "Reels Studio", description: "Production de vidéos courtes.", href: "/admin/reels", zone: "ia", shape: "hotel", icon: Clapperboard, color: "#f472b6", position: [12, 0, -4] },
  { id: "iafluencer", label: "IAfluencer", description: "Création de contenus avec un influenceur IA.", href: "/admin/iafluencer", zone: "ia", shape: "hotel", icon: Video, color: "#f472b6", position: [12, 0, 0] },
  { id: "images", label: "Images locales", description: "Génération et retouche d'images.", href: "/admin/image-studio", zone: "ia", shape: "hotel", icon: ImageIcon, color: "#f472b6", position: [12, 0, 4] },
  { id: "rapports", label: "Rapports", description: "Rapports quotidiens de l'équipe.", href: "/admin/reports", zone: "qg", shape: "hotel", icon: FileText, color: "#fbbf24", position: [-6, 0, 9] },
  { id: "audit-seo", label: "Audit SEO", description: "Audits de performance et de référencement.", href: "/admin/seo", zone: "qg", shape: "hospital", icon: Search, color: "#fbbf24", position: [-2, 0, 9] },
  { id: "escadron", label: "Escadron Agents", description: "Agents IA qui exécutent les tâches et réparations.", href: "/admin/agents", zone: "qg", shape: "hospital", icon: Bot, color: "#fbbf24", position: [2, 0, 9] },
  { id: "planning", label: "Planning", description: "Calendrier des publications et des tâches.", href: "/admin/planning", zone: "qg", shape: "mosque", icon: CalendarDays, color: "#fbbf24", position: [6, 0, 9] },
  { id: "parc-sites", label: "Parc Sites", description: "Flotte des sites clients et de leur santé.", href: "/admin/fleet", zone: "reseau", shape: "house", icon: Factory, color: "#34d399", position: [0, 0, -12], autopilot: true },
  { id: "labs", label: "Labs", description: "Centre R&D et innovation B2B.", href: "https://www.securium-labs.app", external: true, zone: "reseau", shape: "hotel", icon: FlaskConical, color: "#34d399", position: [8, 0, -12] },
  { id: "vitrine", label: "Vitrine", description: "Site public de l'agence.", href: "https://www.securium-agency.fr", external: true, zone: "reseau", shape: "hotel", icon: ExternalLink, color: "#34d399", position: [-8, 0, -12] },
];

// Sites clients : un quartier de maisons autour du Parc Sites. Le QG n'a pas de satellite, c'est la tour centrale.
const PARC_CENTER = { x: 0, z: -12 };
const PARC_RADIUS = 3.8;
const SATELLITE_ANGLES: Record<string, number> = {
  "geoenergy-habitat": -90,
  "elite-depannage-34": 30,
  "rescue-247-uk": 150,
};

export type MatrixSite = { id: string; label: string; url?: string; traffic: number; position: Vec3 };

export const MATRIX_SITES: MatrixSite[] = initialSites.flatMap((site) => {
  const angle = SATELLITE_ANGLES[site.id] as number | undefined;
  if (angle === undefined) return [];
  const radians = (angle * Math.PI) / 180;
  const position: Vec3 = [PARC_CENTER.x + Math.cos(radians) * PARC_RADIUS, 0, PARC_CENTER.z + Math.sin(radians) * PARC_RADIUS];
  return [{ id: site.id, label: site.name, url: site.url, traffic: site.traffic, position }];
});

export function siteName(siteId: string): string {
  return initialSites.find((site) => site.id === siteId)?.name ?? siteId;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Rattache le champ `site` d'une tâche de l'Orchestrateur à un identifiant de site connu.
export function resolveSiteId(raw: string): string | null {
  const key = normalize(raw);
  if (!key) return null;
  const match = initialSites.find((site) => normalize(site.id) === key || normalize(site.name) === key);
  return match?.id ?? null;
}

export function nodePosition(id: string): Vec3 | null {
  return MATRIX_TOOLS.find((tool) => tool.id === id)?.position ?? MATRIX_SITES.find((site) => site.id === id)?.position ?? null;
}
