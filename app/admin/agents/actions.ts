"use server";

import { triggerWorkflow, type TriggerResult } from "@/lib/agents/triggers";

// Bouton « Lancer » du cockpit. La session admin est vérifiée par middleware.ts avant ce point : la clé
// d'intégration n'est jamais envoyée au navigateur.
export async function triggerAgentAction(_previous: TriggerResult | null, formData: FormData): Promise<TriggerResult> {
  const agentId = formData.get("agentId");
  return triggerWorkflow(typeof agentId === "string" ? agentId : "");
}
