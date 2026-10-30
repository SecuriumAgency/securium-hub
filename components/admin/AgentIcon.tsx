import {
  Bot,
  Calculator,
  Crosshair,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  Lightbulb,
  Mail,
  Radar,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AgentIconKey } from "@/lib/agents/registry";

const ICONS: Record<AgentIconKey, LucideIcon> = {
  orchestrator: Workflow,
  market: TrendingUp,
  prospect: Target,
  finance: Calculator,
  devops: Server,
  seo: Lightbulb,
  sync: GitBranch,
  watch: Radar,
  ai: Bot,
  hunter: Crosshair,
  spark: Sparkles,
  mail: Mail,
  report: FileText,
  database: Database,
  search: Search,
  shield: ShieldCheck,
  gauge: Gauge,
  globe: Globe,
};

// Icône Lucide d'un agent. Pas d'état : le composant reste utilisable côté serveur comme côté client.
export function AgentIcon({ icon, className }: { icon: AgentIconKey; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden className={className} />;
}
