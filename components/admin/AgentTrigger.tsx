"use client";

import { useActionState } from "react";
import { triggerAgentAction } from "@/app/admin/agents/actions";
import type { TriggerResult } from "@/lib/agents/triggers";

// Bouton « Lancer » d'un workflow GitHub. L'action vérifie la session ; la clé d'intégration reste côté serveur.
export function AgentTrigger({ workflowId, configured }: { workflowId: string; configured: boolean }) {
  const [state, formAction, pending] = useActionState<TriggerResult | null, FormData>(triggerAgentAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="agentId" value={workflowId} />
      <button
        type="submit"
        disabled={!configured || pending}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Lancement…" : "Lancer"}
      </button>
      {!configured && (
        <p className="text-xs text-warning">Lancement désactivé : GITHUB_ACTIONS_TOKEN n’est pas défini dans les variables du Hub.</p>
      )}
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-destructive"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
