import type { AgentDef, AgentKind } from "@/lib/agents/registry";
import type { AgentState } from "@/lib/agents/status";
import { AgentCard } from "./AgentCard";
import { AgentTabs, type TabItem } from "./AgentTabs";
import { StatusPill } from "./AgentStatus";

export type TelemetryRow = { receivedLabel: string | null; stale: boolean; host: string | null };
export type ProcessRow = { name: string; status: string; restarts: number; upSince: string | null };
export type CockpitCard = { agent: AgentDef; state: AgentState };

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const tableClass = "w-full text-left text-sm";
const headClass = "border-b border-white/10 text-xs uppercase tracking-wider text-muted-foreground";

// Ordre d'affichage des groupes, et leur titre.
const GROUPS: { kind: AgentKind; title: string; hint: string }[] = [
  { kind: "poste", title: "Agents du poste", hint: "Ils tournent sur Securium OS. Le Hub affiche leur état." },
  { kind: "hub", title: "Agents du Hub", hint: "Scripts qui écrivent dans la base du Hub, lancés à la main." },
  { kind: "web", title: "Audits web", hint: "Contrôles sur les sites de la flotte, à la demande." },
  { kind: "github", title: "Workflows GitHub", hint: "Vérifications et mesures sur les dépôts du parc." },
];

function TelemetryBanner({ telemetry }: { telemetry: TelemetryRow }) {
  let text: string;
  if (telemetry.receivedLabel === null) {
    text = "Aucun rapport reçu depuis 24 h : le poste est éteint, ou HUB_API_KEY diffère entre le poste et le Hub.";
  } else if (telemetry.stale) {
    text = `Rapport périmé, reçu à ${telemetry.receivedLabel}. Les états affichés ne sont plus fiables.`;
  } else {
    text = `Rapport reçu à ${telemetry.receivedLabel}${telemetry.host ? ` depuis ${telemetry.host}` : ""}.`;
  }
  const tone = telemetry.receivedLabel !== null && !telemetry.stale ? "border-success/30" : "border-warning/40";
  return (
    <p role="status" className={`rounded-xl border bg-card/60 px-4 py-3 text-sm text-foreground ${tone}`}>
      {text}
    </p>
  );
}

// Cockpit : onglets de chaque agent, puis les agents groupés par nature, puis les processus PM2 du poste.
export function AgentsControlRoom({
  cards,
  tabs,
  processes,
  telemetry,
}: {
  cards: CockpitCard[];
  tabs: TabItem[];
  processes: ProcessRow[];
  telemetry: TelemetryRow;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TelemetryBanner telemetry={telemetry} />

      <AgentTabs items={tabs} currentId={null} />

      {GROUPS.map((group) => {
        const groupCards = cards.filter((card) => card.agent.kind === group.kind);
        if (groupCards.length === 0) return null;
        return (
          <section key={group.kind} id={group.kind} aria-labelledby={`group-${group.kind}`} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={`group-${group.kind}`} className="text-lg font-semibold text-foreground md:text-xl">
                {group.title}
              </h2>
              <p className="text-sm text-muted-foreground">{group.hint}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groupCards.map((card) => (
                <AgentCard key={card.agent.id} agent={card.agent} state={card.state} />
              ))}
            </ul>
          </section>
        );
      })}

      <section aria-labelledby="processes-title" className={`${glass} flex flex-col gap-4`}>
        <h2 id="processes-title" className="text-lg font-semibold text-foreground md:text-xl">
          Processus PM2 du poste
        </h2>
        {processes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun processus reçu. Le rapport de télémétrie est absent ou périmé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Processus PM2 du poste, avec leur statut et leurs redémarrages</caption>
              <thead className={headClass}>
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Processus</th>
                  <th scope="col" className="px-3 py-2 font-medium">Statut</th>
                  <th scope="col" className="px-3 py-2 font-medium">Démarré</th>
                  <th scope="col" className="px-3 py-2 font-medium">Redémarrages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {processes.map((process) => (
                  <tr key={process.name} className="transition-colors hover:bg-muted">
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-foreground">{process.name}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusPill status={process.status === "online" ? "running" : process.status === "stopped" ? "idle" : process.status === "errored" ? "error" : "unknown"} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">{process.upSince ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">{process.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
