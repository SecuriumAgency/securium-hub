import { AgentTaskType } from "../generated/prisma/enums";

// « Cerveau » de l'Orchestrateur : classe un rapport par règles de mots-clés, sans appel à un modèle.
// Déterministe, gratuit et testable (scripts/orchestrator-categorize.test.mts).
// La première règle qui correspond gagne : sécurité d'abord (urgence), puis erreurs techniques, SEO, UI.
// Sans correspondance : DEV, le rapport technique par défaut.
const RULES: { type: AgentTaskType; pattern: RegExp }[] = [
  {
    type: AgentTaskType.SECURITE,
    pattern: /\b(securit|vulnerab|cve|injection|xss|intrusion|fuite|brute.?force|non autoris|unauthori[sz]ed)/,
  },
  {
    type: AgentTaskType.DEV,
    pattern: /\b(erreur|error|exception|crash|build|deploy\w*|timeout|cron|prisma|typescript|lint|500)\b/,
  },
  {
    type: AgentTaskType.SEO,
    pattern: /\b(seo|trafic|indexation|sitemap|serp|backlink\w*|canonical\w*|google|impressions?|positions?)\b/,
  },
  {
    type: AgentTaskType.UI,
    pattern: /\b(ui|ux|interface|affichage|mise en page|layout|mobile|responsive|accessibilit\w*|css|cls|lcp|formulaire|bouton|cta)\b/,
  },
];

/** Agent par défaut de chaque type. Modifiable ici seulement. */
export const AGENT_FOR_TYPE: Record<AgentTaskType, string> = {
  SEO: "SEO Architect",
  DEV: "DevOps",
  SECURITE: "Félix Fix",
  UI: "Félix Fix",
};

/** Minuscules, sans accents : « Sécurité » et « securite » correspondent. */
function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Type de tâche d'un rapport, et le mot-clé qui l'a décidé (null si repli sur DEV). */
export function classify(message: string): { type: AgentTaskType; keyword: string | null } {
  const text = normalize(message);
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) return { type: rule.type, keyword: match[0] };
  }
  return { type: AgentTaskType.DEV, keyword: null };
}
