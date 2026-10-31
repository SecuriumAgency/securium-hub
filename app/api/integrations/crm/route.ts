import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { callModule, moduleFailure, moduleUrl, notConfigured, NO_STORE, unauthorized, ModuleFailure } from "@/lib/integrations/bridge";

// Pont vers Chatwoot : les conversations ouvertes du compte. Lecture seule ; la réponse se limite aux champs utiles à la grille.
export const dynamic = "force-dynamic";

const conversationsResponse = z.object({
  data: z.object({
    payload: z.array(
      z.object({
        id: z.number(),
        status: z.string(),
        created_at: z.number(),
        unread_count: z.number().optional(),
      }),
    ),
  }),
});

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const url = moduleUrl("CHATWOOT");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const token = process.env.CHATWOOT_API_TOKEN;
  if (!url || !accountId || !token) {
    return notConfigured("Chatwoot", ["CHATWOOT_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_API_TOKEN"]);
  }

  try {
    const upstream = await callModule("Chatwoot", `${url}/api/v1/accounts/${encodeURIComponent(accountId)}/conversations?status=open`, {
      headers: { api_access_token: token, Accept: "application/json" },
    });
    const parsed = conversationsResponse.safeParse(await upstream.json());
    if (!parsed.success) throw new ModuleFailure("Chatwoot a renvoyé une réponse inattendue.");

    const conversations = parsed.data.data.payload.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      createdAt: new Date(conversation.created_at * 1000).toISOString(),
      unread: conversation.unread_count ?? 0,
    }));
    return NextResponse.json({ conversations }, { headers: NO_STORE });
  } catch (error) {
    return moduleFailure(error);
  }
}
