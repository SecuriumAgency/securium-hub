"use client";

import { useEffect, useMemo } from "react";
import { CORE_TOOLS } from "@/lib/coreToolsRegistry";
import { deriveServiceState, type ServiceState } from "@/lib/coreToolState";
import { useTelemetry } from "@/lib/use-telemetry";
import { useHubStore } from "@/store/useHubStore";
import { useCoreToolsStore } from "@/store/useCoreToolsStore";

// Publie l'état de service de chaque bâtiment du Core, à partir des stores déjà alimentés par la barre latérale.
// Aucune requête supplémentaire : la télémétrie, les sites et les demandes B2B sont déjà à jour.
// Le calcul ne tourne que si l'une de ces entrées change.
export function useCoreStatePublisher() {
  const telemetry = useTelemetry().data;
  const sites = useHubStore((state) => state.sitesNetwork);
  const pendingB2B = useHubStore((state) =>
    state.b2bProspects.reduce((count, item) => (item.status === "À auditer" ? count + 1 : count), 0),
  );
  const setStates = useCoreToolsStore((state) => state.setStates);

  const states = useMemo(() => {
    const map: Record<string, ServiceState> = {};
    for (const tool of CORE_TOOLS) {
      map[tool.nodeId] = deriveServiceState(tool.stateSource, { telemetry, sites, pendingB2B });
    }
    return map;
  }, [telemetry, sites, pendingB2B]);

  useEffect(() => {
    setStates(states);
  }, [states, setStates]);
}
