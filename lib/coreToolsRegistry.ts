// Registre central des outils du Securium Core. Chaque outil est un bâtiment du plan : soit l'un des sept bâtiments déjà posés
// sur le socle (hubGrid.ts), soit l'un des neuf bâtiments du quartier du QG (village-layout.ts, CORE_DISTRICT_CELLS).
// Ce fichier ne contient que de la configuration : aucune donnée, aucun appel réseau.
//
// Modèles : seuls les bâtiments présents dans public/models/hub/commercial sont utilisés. Le kit Kenney local n'a ni data-center,
// ni tour radar, ni entrepôt : en ajouter demande un téléchargement, à valider avant.
import { CORE_DISTRICT_CELLS, type CommercialModel } from "@/components/3d/village-layout";

export type CoreCategory = "Pilotage" | "Agents" | "Prospection" | "Contenu" | "Sécurité" | "Opérations";

// Forme des données affichées dans le panneau d'outil, selon la source :
//  telemetry : agents et serveurs (store de télémétrie) ; planning : planning des agents (rapport du poste) ;
//  fleet : sites (store du hub) ; b2b : demandes (store du hub) ; prospection : compteurs (/api/prospection/stats) ;
//  rushes : rushs déposés (/api/rushes) ; none : pas de flux temps réel pour cet outil.
export type ToolView = "telemetry" | "planning" | "fleet" | "b2b" | "prospection" | "rushes" | "none";

// Source de l'état de service, qui colore la lueur du bâtiment : vert OK, ambre avertissement, rouge erreur.
//  agents : états des agents ; pm2 : santé des processus ; fleet : statut des sites ; b2b : demandes à auditer ; none : aucun.
export type StateSource = "agents" | "pm2" | "fleet" | "b2b" | "none";

export type CoreTool = {
  // Identifiant stable de l'outil.
  id: string;
  // Identifiant du bâtiment dans la scène 3D (identifiant de GRID_MAP ou de la liste du quartier).
  nodeId: string;
  label: string;
  category: CoreCategory;
  // Modèle Kenney du bâtiment. Les bâtiments d'un même modèle partagent la géométrie.
  buildingModel: CommercialModel;
  // Couleur d'identité de l'outil : lueur de sélection. L'état de service a ses propres couleurs (coreToolState.ts).
  colorGlow: string;
  // Route dont l'outil tire ses données réelles. Null : aucun flux.
  apiEndpoint: string | null;
  view: ToolView;
  stateSource: StateSource;
  href: string;
  placement: "socle" | "district";
};

export const CORE_TOOLS: CoreTool[] = [
  // Bâtiments déjà posés sur le socle, rattachés à leur outil.
  { id: "prospection", nodeId: "immeuble-a-rue-2", label: "Prospection", category: "Prospection", buildingModel: "building-a", colorGlow: "#a78bfa", apiEndpoint: "/api/prospection/stats", view: "prospection", stateSource: "none", href: "/admin/outreach", placement: "socle" },
  { id: "parc-sites", nodeId: "immeuble-a-rue", label: "Parc Sites", category: "Opérations", buildingModel: "building-a", colorGlow: "#22d3ee", apiEndpoint: "/api/fleet", view: "fleet", stateSource: "fleet", href: "/admin/fleet", placement: "socle" },
  { id: "lead-broker", nodeId: "immeuble-c-rue", label: "Lead Broker", category: "Prospection", buildingModel: "building-c", colorGlow: "#f59e0b", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/broker", placement: "socle" },
  { id: "matchmaker", nodeId: "immeuble-c-fond", label: "Matchmaker", category: "Prospection", buildingModel: "building-c", colorGlow: "#f472b6", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/broker/matchmaker", placement: "socle" },
  { id: "audit-seo", nodeId: "immeuble-a-fond", label: "Audit SEO", category: "Sécurité", buildingModel: "building-a", colorGlow: "#34d399", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/seo", placement: "socle" },
  { id: "rapports", nodeId: "immeuble-c-fond-2", label: "Rapports", category: "Opérations", buildingModel: "building-c", colorGlow: "#a3e635", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/reports", placement: "socle" },
  { id: "images-locales", nodeId: "boutique", label: "Images locales", category: "Contenu", buildingModel: "building-f", colorGlow: "#fb923c", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/image-studio", placement: "socle" },

  // Quartier du QG : neuf bâtiments, placés dans les cases réservées autour du socle, dans cet ordre.
  { id: "batcave", nodeId: "core-batcave", label: "Batcave", category: "Pilotage", buildingModel: "building-d", colorGlow: "#22d3ee", apiEndpoint: "/api/telemetry", view: "telemetry", stateSource: "agents", href: "/admin/command", placement: "district" },
  { id: "agents", nodeId: "core-agents", label: "Escadron Agents", category: "Agents", buildingModel: "building-e", colorGlow: "#818cf8", apiEndpoint: "/api/telemetry", view: "telemetry", stateSource: "agents", href: "/admin/agents", placement: "district" },
  { id: "reels", nodeId: "core-reels", label: "Reels Studio", category: "Contenu", buildingModel: "building-b", colorGlow: "#e879f9", apiEndpoint: "/api/rushes", view: "rushes", stateSource: "none", href: "/admin/reels", placement: "district" },
  { id: "iafluencer", nodeId: "core-iafluencer", label: "IAfluencer", category: "Contenu", buildingModel: "building-f", colorGlow: "#c084fc", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/iafluencer", placement: "district" },
  { id: "osint", nodeId: "core-osint", label: "OSINT", category: "Sécurité", buildingModel: "building-d", colorGlow: "#f87171", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/osint", placement: "district" },
  { id: "planning", nodeId: "core-planning", label: "Planning", category: "Opérations", buildingModel: "building-e", colorGlow: "#fbbf24", apiEndpoint: "/api/telemetry", view: "planning", stateSource: "none", href: "/admin/planning", placement: "district" },
  { id: "ecosystem", nodeId: "core-ecosystem", label: "Écosystème", category: "Pilotage", buildingModel: "building-f", colorGlow: "#2dd4bf", apiEndpoint: null, view: "none", stateSource: "none", href: "/admin/ecosystem", placement: "district" },
  { id: "securium-os", nodeId: "core-securium-os", label: "Securium OS", category: "Agents", buildingModel: "building-a", colorGlow: "#38bdf8", apiEndpoint: "/api/telemetry", view: "telemetry", stateSource: "pm2", href: "/admin/agents#poste", placement: "district" },
  { id: "audit-b2b", nodeId: "core-audit-b2b", label: "Audit B2B", category: "Prospection", buildingModel: "building-c", colorGlow: "#f59e0b", apiEndpoint: "/api/b2b/prospects", view: "b2b", stateSource: "b2b", href: "/admin/audit", placement: "district" },
];

// Emplacements du quartier : un outil par case réservée, dans l'ordre des cases. La dixième case reste libre.
export const CORE_DISTRICT_LAYOUT: { tool: CoreTool; x: number; z: number }[] = CORE_TOOLS.filter((tool) => tool.placement === "district").map(
  (tool, index) => ({ tool, x: CORE_DISTRICT_CELLS[index].x, z: CORE_DISTRICT_CELLS[index].z }),
);

const BY_NODE = new Map(CORE_TOOLS.map((tool) => [tool.nodeId, tool]));

// Outil rattaché à un bâtiment du plan, ou null (bâtiment hors registre).
export function toolForNode(nodeId: string | null): CoreTool | null {
  return nodeId ? (BY_NODE.get(nodeId) ?? null) : null;
}
