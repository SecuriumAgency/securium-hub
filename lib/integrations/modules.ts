// Les neuf modules de l'écosystème. Chacun se relie au Hub par deux variables d'environnement :
// `<PREFIXE>_URL` (appel par le serveur, jamais exposé au navigateur) et `<PREFIXE>_PUBLIC_URL` (bouton « Ouvrir »).
// Un module sans `<PREFIXE>_URL` s'affiche « Non configuré », jamais « Hors ligne ».
export type IntegrationModule = {
  id: string;
  name: string;
  role: string;
  prefix: string;
  // Pont du Hub vers le module, quand il existe : voir app/api/integrations/.
  bridge?: "seo" | "voice" | "crm" | "calendar";
};

export const INTEGRATION_MODULES: IntegrationModule[] = [
  { id: "open-higgsfield", name: "Open-Higgsfield", role: "Génération d'images et de vidéos", prefix: "OPEN_HIGGSFIELD" },
  { id: "voicestudio", name: "VoiceStudio", role: "Synthèse vocale", prefix: "VOICE_STUDIO", bridge: "voice" },
  { id: "open-seo", name: "Open-SEO", role: "Audit SEO des sites de la flotte", prefix: "OPEN_SEO", bridge: "seo" },
  { id: "weknora", name: "WeKnora", role: "Base de connaissance et recherche", prefix: "WEKNORA" },
  { id: "openwhispr", name: "OpenWhispr", role: "Dictée vocale", prefix: "OPENWHISPR" },
  { id: "openproject", name: "OpenProject", role: "Gestion de projet", prefix: "OPENPROJECT" },
  { id: "calcom", name: "Cal.com", role: "Agenda et prises de rendez-vous", prefix: "CALCOM", bridge: "calendar" },
  { id: "chatwoot", name: "Chatwoot", role: "CRM et messagerie client", prefix: "CHATWOOT", bridge: "crm" },
  { id: "cap", name: "Cap", role: "Enregistrement d'écran", prefix: "CAP" },
];
