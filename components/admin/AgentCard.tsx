import Link from "next/link";
import type { AgentDef } from "@/lib/agents/registry";
import type { AgentState } from "@/lib/agents/status";
import { AgentIcon } from "./AgentIcon";
import { KIND_BAR, KIND_TEXT, KindLabel, StatusPill } from "./AgentStatus";

// Carte d'un agent dans le cockpit : cliquable, elle ouvre la fiche de l'agent.
export function AgentCard({ agent, state }: { agent: AgentDef; state: AgentState }) {
  return (
    <li className="flex">
      <Link
        href={`/admin/agents/${agent.id}`}
        className="group relative flex w-full flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-5 shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${KIND_BAR[agent.kind]}`} />
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-muted">
            <AgentIcon icon={agent.icon} className={`size-5 ${KIND_TEXT[agent.kind]}`} />
          </span>
          <StatusPill status={state.status} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <KindLabel kind={agent.kind} />
          <h3 className="break-words text-base font-semibold text-foreground group-hover:text-primary">{agent.name}</h3>
          <p className="line-clamp-3 text-sm text-muted-foreground">{agent.mission}</p>
        </div>
        <div className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
          <p>{agent.schedule}</p>
          {state.lastAction && (
            <p className="truncate" title={state.lastAction}>
              Dernière action : {state.lastAction}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
