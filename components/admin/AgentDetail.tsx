import Link from "next/link";
import type { AgentDef } from "@/lib/agents/registry";
import type { AgentState } from "@/lib/agents/status";
import { AgentIcon } from "./AgentIcon";
import { AgentTrigger } from "./AgentTrigger";
import { KIND_TEXT, KindLabel, StatusPill } from "./AgentStatus";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-5 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const badge = "inline-flex shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium";

const EVENT_TONE: Record<"active" | "paused" | "error", string> = {
  active: "border-success/30 bg-success/10 text-success",
  paused: "border-border bg-muted text-muted-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};
const EVENT_LABEL: Record<"active" | "paused" | "error", string> = {
  active: "Actif",
  paused: "En pause",
  error: "Erreur",
};

// Ce que la fiche dit de la façon de lancer l'agent, selon l'endroit où il tourne.
function launchNote(agent: AgentDef): string {
  if (agent.kind === "poste") return "Cet agent tourne sur le poste Securium OS. Le Hub affiche son état, il ne le lance pas.";
  if (agent.kind === "hub") return "Script exécuté à la main depuis le poste. Le Hub ne le lance pas.";
  if (agent.kind === "web") return "Lancé depuis sa page dédiée du Hub.";
  return "Pas de bouton ici : ce workflow se déclenche sur événement GitHub.";
}

// Fiche d'un agent : ce qu'il fait, ce qu'il lit et produit, son état, ses derniers signaux et où le voir.
export function AgentDetail({ agent, state, configured }: { agent: AgentDef; state: AgentState; configured: boolean }) {
  return (
    <article className="flex flex-col gap-6">
      <section className={`${glass} flex flex-col gap-5 md:flex-row md:items-start md:justify-between`}>
        <div className="flex min-w-0 gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-muted">
            <AgentIcon icon={agent.icon} className={`size-8 ${KIND_TEXT[agent.kind]}`} />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <KindLabel kind={agent.kind} />
            <h2 className="break-words text-2xl font-semibold text-foreground">{agent.name}</h2>
            <p className="text-sm text-muted-foreground">{agent.mission}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          <StatusPill status={state.status} />
          {state.pm2Status && (
            <p className="text-xs text-muted-foreground">
              PM2 : <span className="font-mono text-foreground">{state.pm2Status}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">{agent.schedule}</p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="agent-inputs" className={`${glass} flex flex-col gap-3`}>
          <h3 id="agent-inputs" className="text-base font-semibold text-foreground">
            Ce qu’il lit
          </h3>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
            {agent.inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="agent-outputs" className={`${glass} flex flex-col gap-3`}>
          <h3 id="agent-outputs" className="text-base font-semibold text-foreground">
            Ce qu’il produit
          </h3>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
            {agent.outputs.map((output) => (
              <li key={output}>{output}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="agent-launch" className={`${glass} flex flex-col gap-3`}>
          <h3 id="agent-launch" className="text-base font-semibold text-foreground">
            Lancer
          </h3>
          <p className="text-sm text-muted-foreground">{launchNote(agent)}</p>
          {agent.triggerId && <AgentTrigger workflowId={agent.triggerId} configured={configured} />}
        </section>

        <section aria-labelledby="agent-links" className={`${glass} flex flex-col gap-3`}>
          <h3 id="agent-links" className="text-base font-semibold text-foreground">
            Où le voir dans le Hub
          </h3>
          {agent.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune page dédiée : l’état vient du cockpit.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {agent.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="agent-signals" className={`${glass} flex flex-col gap-3`}>
        <h3 id="agent-signals" className="text-base font-semibold text-foreground">
          Derniers signaux
        </h3>
        {state.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun signal reçu pour cet agent. Le Hub ne reçoit de signaux que des agents du poste, quand le rapport est frais.
          </p>
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-white/5">
              {state.events.map((event, index) => (
                <li key={`${index}-${event.action}`} className="flex items-start gap-3 py-2 text-sm">
                  <span className={`${badge} ${EVENT_TONE[event.status]}`}>{EVENT_LABEL[event.status]}</span>
                  <span className="min-w-0 break-words text-foreground">{event.action}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">Le journal n’est pas horodaté : l’ordre seul compte, du plus récent au plus ancien.</p>
          </>
        )}
      </section>

      <section aria-labelledby="agent-source" className={`${glass} flex flex-col gap-2`}>
        <h3 id="agent-source" className="text-base font-semibold text-foreground">
          Source
        </h3>
        <p className="break-all font-mono text-xs text-muted-foreground">{agent.source}</p>
        {agent.caution && (
          <p role="note" className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            {agent.caution}
          </p>
        )}
      </section>
    </article>
  );
}
