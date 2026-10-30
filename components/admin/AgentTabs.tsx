import Link from "next/link";
import type { AgentIconKey, AgentKind } from "@/lib/agents/registry";
import type { DisplayStatus } from "@/lib/agents/status";
import { AgentIcon } from "./AgentIcon";
import { StatusDot } from "./AgentStatus";

export type TabItem = { id: string; name: string; icon: AgentIconKey; kind: AgentKind; status: DisplayStatus };

// Onglets de tous les agents : un clic pour passer de la fiche d'un agent à celle d'un autre.
export function AgentTabs({ items, currentId }: { items: TabItem[]; currentId: string | null }) {
  return (
    <nav aria-label="Agents" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-2 pb-1">
        {items.map((item) => {
          const active = item.id === currentId;
          return (
            <li key={item.id}>
              <Link
                href={`/admin/agents/${item.id}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  active ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <AgentIcon icon={item.icon} className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{item.name}</span>
                <StatusDot status={item.status} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
