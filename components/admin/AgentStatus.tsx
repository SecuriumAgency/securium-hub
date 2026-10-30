import { KIND_LABEL, type AgentKind } from "@/lib/agents/registry";
import { STATUS_LABEL, type DisplayStatus } from "@/lib/agents/status";

// Couleurs de l'écosystème : ambre pour le poste, violet pour le Hub, ambre clair pour le web, vert pour GitHub.
export const KIND_BAR: Record<AgentKind, string> = {
  poste: "bg-primary",
  hub: "bg-draft",
  web: "bg-warning",
  github: "bg-success",
};

export const KIND_TEXT: Record<AgentKind, string> = {
  poste: "text-primary",
  hub: "text-draft",
  web: "text-warning",
  github: "text-success",
};

const neutral = "border-border bg-muted text-muted-foreground";

const STATUS_TONE: Record<DisplayStatus, string> = {
  running: "border-success/30 bg-success/10 text-success",
  idle: neutral,
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: neutral,
  absent: neutral,
  "not-watched": neutral,
};

// Point lumineux : il s'allume en vert pour un agent en cours, en rouge pour une erreur.
const STATUS_DOT: Record<DisplayStatus, string> = {
  running: "bg-success shadow-[0_0_10px] shadow-success/70",
  idle: "bg-muted-foreground",
  error: "bg-destructive shadow-[0_0_10px] shadow-destructive/70",
  unknown: "bg-muted-foreground",
  absent: "bg-muted-foreground/60",
  "not-watched": "bg-muted-foreground/40",
};

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>
      <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: DisplayStatus }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />;
}

export function KindLabel({ kind }: { kind: AgentKind }) {
  return <p className={`text-xs font-medium uppercase tracking-wider ${KIND_TEXT[kind]}`}>{KIND_LABEL[kind]}</p>;
}
