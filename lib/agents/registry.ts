// Catalogue des agents de l'écosystème : ce que fait chacun, ce qu'il lit et produit, où il tourne, et où
// le retrouver dans le Hub. Source du cockpit (/admin/agents) et des fiches (/admin/agents/[agentId]).
// Inventaire détaillé : AGENTS_REGISTRY.md à la racine du dépôt.

export type AgentKind = "poste" | "hub" | "web" | "github";

export type AgentIconKey =
  | "orchestrator"
  | "market"
  | "prospect"
  | "finance"
  | "devops"
  | "seo"
  | "sync"
  | "watch"
  | "ai"
  | "hunter"
  | "spark"
  | "mail"
  | "report"
  | "database"
  | "search"
  | "shield"
  | "gauge"
  | "globe";

export type AgentLink = { label: string; href: string };

export type AgentDef = {
  id: string;
  name: string;
  kind: AgentKind;
  icon: AgentIconKey;
  // Une phrase : ce que fait l'agent.
  mission: string;
  inputs: string[];
  outputs: string[];
  schedule: string;
  // Fichier ou workflow qui implémente l'agent.
  source: string;
  // Nom du journal d'activité (signal `agent_status` des scripts) : relie l'agent à sa ligne du rapport.
  telemetryName?: string;
  // Processus PM2 du poste, pour l'état de fond.
  pm2Name?: string;
  // Workflow GitHub lançable depuis le cockpit (identifiant de lib/agents/triggers.ts).
  triggerId?: string;
  // Pages du Hub où l'agent se voit.
  links: AgentLink[];
  // Point d'attention affiché sur la fiche.
  caution?: string;
};

export const KIND_LABEL: Record<AgentKind, string> = {
  poste: "Poste",
  hub: "Hub",
  web: "Web",
  github: "GitHub",
};

// Les agents du poste tournent chaque jour via start-all-agents, lancé par l'orchestrateur à 20h00.
const DAILY_VIA_ORCHESTRATOR = "Quotidien, via l’orchestrateur (20h00)";

export const AGENTS: AgentDef[] = [
  {
    id: "orchestrator",
    name: "Orchestrateur",
    kind: "poste",
    icon: "orchestrator",
    mission: "Lit les messages Discord, puis lance un cycle complet de la flotte d’agents du poste.",
    inputs: ["Messages Discord (contexte, données non fiables)", "Variables du fichier .env de Securium OS, chargées sans être affichées"],
    outputs: ["Lancement de start-all-agents", "Journaux logs/pm2-orchestrator-*.log"],
    schedule: "Chaque jour à 20h00 (cron PM2)",
    source: "Securium-OS/scripts/sec-orchestrator.sh",
    pm2Name: "securium-orchestrator",
    links: [{ label: "Vue de la flotte", href: "/admin/fleet" }],
  },
  {
    id: "market-simulator",
    name: "Market Simulator",
    kind: "poste",
    icon: "market",
    mission:
      "Crash-test du marché avec la Founder Skill sur 20 clients, puis stratégie d’acquisition B2B en lecture seule.",
    inputs: ["Dossier Maison Mawadda", "Dépôts geoenergyhabitat et elite-depannage, en lecture"],
    outputs: ["Rapport PDF market-simulator.pdf", "Écritures limitées au dossier founder/ de Maison Mawadda"],
    schedule: DAILY_VIA_ORCHESTRATOR,
    source: "Securium-OS/scripts/simulate-market.sh",
    telemetryName: "Market Simulator",
    links: [],
  },
  {
    id: "lead-prospector",
    name: "Lead Prospector",
    kind: "poste",
    icon: "prospect",
    mission: "Rédige une stratégie d’acquisition B2B en un paragraphe, appuyée sur les dépôts du parc.",
    inputs: ["Dépôts geoenergyhabitat, elite-depannage et maison-mawadda, en lecture"],
    outputs: ["Rapport PDF lead-prospector.pdf", "Journal d’activité"],
    schedule: DAILY_VIA_ORCHESTRATOR,
    source: "Securium-OS/scripts/run-prospector.sh",
    telemetryName: "Lead Prospector",
    links: [{ label: "Prospection", href: "/admin/outreach" }],
  },
  {
    id: "cfo",
    name: "CFO",
    kind: "poste",
    icon: "finance",
    mission:
      "Audite les coûts d’infrastructure du parc, puis la rentabilité des trois écrins Maison Mawadda.",
    inputs: ["Fichiers de configuration et dépendances du parc, sans les .env", "founder/pitch.md et founder/customer.json"],
    outputs: ["Rapport PDF cfo.pdf", "Journal d’activité"],
    schedule: DAILY_VIA_ORCHESTRATOR,
    source: "Securium-OS/scripts/run-cfo.sh",
    telemetryName: "CFO",
    links: [],
    caution: "Chiffres estimés : rien n’est une donnée réelle sans vérification.",
  },
  {
    id: "devops",
    name: "DevOps",
    kind: "poste",
    icon: "devops",
    mission:
      "Rapport de santé croisé du parc : CI/CD, sécurité, packages obsolètes. Ne modifie rien, sauf correction Dependabot si SECURIUM_AUTOFIX=1.",
    inputs: ["Dépôts du parc (package.json, workflows)", "Erreurs CI remontées sur Discord"],
    outputs: ["Rapport PDF devops.pdf", "Journal d’activité"],
    schedule: DAILY_VIA_ORCHESTRATOR,
    source: "Securium-OS/scripts/run-devops.sh",
    telemetryName: "DevOps",
    links: [{ label: "Vue de la flotte", href: "/admin/fleet" }],
    caution: "La correction automatique Dependabot est désactivée par défaut.",
  },
  {
    id: "seo-architect",
    name: "SEO Architect (IA)",
    kind: "poste",
    icon: "seo",
    mission:
      "Recommandation quotidienne sur les Core Web Vitals (LCP, INP, CLS) des sites Next.js du parc. Ne modifie aucun fichier.",
    inputs: ["Métriques GA4 et GSC remontées sur Discord"],
    outputs: ["Rapport PDF seo-architect.pdf", "Journal d’activité"],
    schedule: DAILY_VIA_ORCHESTRATOR,
    source: "Securium-OS/scripts/run-seo.sh",
    telemetryName: "SEO Architect",
    links: [{ label: "Audit SEO", href: "/admin/seo" }],
  },
  {
    id: "sync-remote",
    name: "Sync remote",
    kind: "poste",
    icon: "sync",
    mission: "Pousse groupé les dépôts du parc, à 23h30 ou dès 20 commits d’avance.",
    inputs: ["Commits locaux des dépôts du parc"],
    outputs: ["Commits poussés sur les dépôts distants"],
    schedule: "23h30 chaque jour, ou dès 20 commits d’avance",
    source: "Securium-OS/scripts/sync-remote.mts",
    pm2Name: "securium-sync-remote",
    links: [],
    caution: "Pousse sur les dépôts distants : vérifier le périmètre avant tout ajout.",
  },
  {
    id: "fleet-watch",
    name: "Fleet watch",
    kind: "poste",
    icon: "watch",
    mission:
      "Scanne les dépôts et les builds de la flotte toutes les 60 s, et envoie la télémétrie au Hub toutes les 10 s.",
    inputs: ["Dépôts du workspace", "Processus PM2 du poste"],
    outputs: ["Télémétrie vers POST /api/telemetry", "Journal logs/fleet-checks.json"],
    schedule: "En continu",
    source: "Securium-OS/agent-dashboard/scripts/fleet-watch.mjs",
    pm2Name: "securium-fleet-watch",
    links: [{ label: "Parc Sites", href: "/admin/fleet" }],
  },
  {
    id: "autonomous-workers",
    name: "Autonomous workers",
    kind: "poste",
    icon: "ai",
    mission: "Boucle d’agents IA : produit des livrables avec l’API Anthropic, et les commit dans les dépôts.",
    inputs: ["Contexte des dépôts", "ANTHROPIC_API_KEY, dans l’environnement ou .env.local"],
    outputs: ["Fichiers livrés et commits locaux"],
    schedule: "En continu, relance espacée d’une minute",
    source: "Securium-OS/agent-dashboard/scripts/autonomous-workers.mts",
    pm2Name: "securium-ai-workers",
    links: [],
    caution: "Commit automatique des livrables dans les dépôts : relire les commits. Facturé à l’API Anthropic.",
  },
  {
    id: "chasseur",
    name: "Le Chasseur",
    kind: "hub",
    icon: "hunter",
    mission: "Rédige un email par prospect à partir du brief. Rien ne part sans validation humaine.",
    inputs: ["Brief de l’agence (réglages)", "Prospects sans brouillon, au statut Nouveau"],
    outputs: ["Brouillons à valider dans l’onglet Suivi"],
    schedule: "Manuel : agent-chasseur.mts et agent-chasseur-segments.mts",
    source: "securium-hub/scripts/agent-chasseur.mts",
    links: [{ label: "Brouillons à valider", href: "/admin/outreach?vue=suivi" }],
  },
  {
    id: "icebreakers",
    name: "Icebreakers",
    kind: "hub",
    icon: "spark",
    mission:
      "Rédige une accroche de premier contact par prospect. Ne tourne que du lundi au vendredi, de 9h à 18h (Paris), sauf --any-hour.",
    inputs: ["Prospects au statut Nouveau, avec ville ou secteur", "Liste de blocage (blocklist.json)"],
    outputs: ["Brouillons au statut A_valider, colonne « Icebreaker généré »"],
    schedule: "Manuel, dans les horaires d’envoi",
    source: "securium-hub/scripts/agent-icebreakers.mts",
    links: [{ label: "Kanban", href: "/admin/outreach" }],
  },
  {
    id: "inbound",
    name: "Réponses entrantes",
    kind: "hub",
    icon: "mail",
    mission: "Lit la boîte IMAP et enregistre les réponses des prospects, sans doublon (Message-ID).",
    inputs: ["Boîte IMAP de l’agence"],
    outputs: ["Messages entrants dans la fiche du prospect"],
    schedule: "Manuel : agent-inbound.mts",
    source: "securium-hub/scripts/agent-inbound.mts",
    links: [{ label: "Suivi des prospects", href: "/admin/outreach?vue=suivi" }],
  },
  {
    id: "fleet-report",
    name: "Rapport de flotte",
    kind: "hub",
    icon: "report",
    mission: "Rapport quotidien de la flotte. Rôle déduit du nom du script, à confirmer à la lecture.",
    inputs: ["Statuts Vercel et leads"],
    outputs: ["Rapport quotidien (destination à confirmer)"],
    schedule: "Manuel ou planifié : à confirmer",
    source: "securium-hub/scripts/fleet-daily-report.mts",
    links: [{ label: "Parc Sites", href: "/admin/fleet" }],
    caution: "Rôle lu sur le nom seulement : à relire avant de s’y fier.",
  },
  {
    id: "migrate-outreach",
    name: "Migration du registre",
    kind: "hub",
    icon: "database",
    mission: "Importe le registre du prospecteur dans le Hub. Un réimport ne crée aucun doublon (adresse normalisée).",
    inputs: ["Registre du prospecteur"],
    outputs: ["Prospects dans la base du Hub"],
    schedule: "Manuel : migrate-outreach.mts",
    source: "securium-hub/scripts/migrate-outreach.mts",
    links: [{ label: "Prospection", href: "/admin/outreach" }],
  },
  {
    id: "seo-audit",
    name: "Audit SEO",
    kind: "web",
    icon: "search",
    mission: "Onze contrôles sur une page d’un site et sur ses fichiers robots.txt et sitemap.xml. Score sur 100, sans IA.",
    inputs: ["Page d’accueil d’un site de la flotte", "robots.txt et sitemap.xml du site"],
    outputs: ["Score sur 100 et recommandations"],
    schedule: "À la demande",
    source: "securium-hub/lib/seo/checks.ts",
    links: [{ label: "Lancer un audit", href: "/admin/seo" }],
  },
  {
    id: "geo-ci",
    name: "Validation CI · GeoEnergy",
    kind: "github",
    icon: "shield",
    mission: "Build à chaque pull request, puis fusion automatique une fois les vérifications passées.",
    inputs: ["Pull requests du dépôt geoenergyhabitat"],
    outputs: ["Fusion automatique (squash)"],
    schedule: "À chaque pull request",
    source: "SecuriumAgency/geoenergyhabitat · ci-validation.yml",
    links: [],
    caution: "La fusion automatique attend que les vérifications passent.",
  },
  {
    id: "geo-lighthouse",
    name: "Lighthouse · GeoEnergy",
    kind: "github",
    icon: "gauge",
    mission: "Mesure les performances du site GeoEnergy Habitat (Lighthouse CI).",
    inputs: ["Build de production du site"],
    outputs: ["Rapports Lighthouse, en artefacts GitHub"],
    schedule: "À la demande",
    source: "SecuriumAgency/geoenergyhabitat · lighthouse.yml",
    triggerId: "geo-lighthouse",
    links: [],
  },
  {
    id: "geo-indexation",
    name: "Indexation Google · GeoEnergy",
    kind: "github",
    icon: "globe",
    mission: "Soumet à Google les pages récemment modifiées du site, d’après le sitemap.",
    inputs: ["sitemap.xml, dates lastmod"],
    outputs: ["Demandes d’indexation"],
    schedule: "À la demande, fenêtre de fraîcheur réglable",
    source: "SecuriumAgency/geoenergyhabitat · seo-indexing.yml",
    triggerId: "geo-indexation",
    links: [],
    caution: "Utilise une clé de service Google, écrite pour le run puis supprimée.",
  },
  {
    id: "elite-lighthouse",
    name: "Lighthouse · Elite Dépannage",
    kind: "github",
    icon: "gauge",
    mission: "Mesure les performances du site Elite Dépannage (Lighthouse CI).",
    inputs: ["Build de production du site"],
    outputs: ["Rapports Lighthouse, en artefacts GitHub"],
    schedule: "À la demande",
    source: "SecuriumAgency/Elite-Depannage · lighthouse-ci.yml",
    triggerId: "elite-lighthouse",
    links: [],
  },
];

export function findAgent(id: string): AgentDef | undefined {
  return AGENTS.find((agent) => agent.id === id);
}
