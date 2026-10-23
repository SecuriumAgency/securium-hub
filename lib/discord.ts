import type { Lead } from "./generated/prisma/client";
import { initialSites } from "./sites";

const TIMEOUT_MS = 5000;
const EMBED_COLOR = 0x22d3ee;

// Publie le lead sur le salon Discord. Ne lève jamais : le lead est déjà enregistré, un échec
// Discord est seulement journalisé.
export async function notifyDiscord(lead: Lead) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.warn(`[discord] DISCORD_WEBHOOK_URL n'est pas défini : lead ${lead.id} non notifié.`);
    return;
  }

  const siteName = initialSites.find((site) => site.id === lead.siteId)?.name ?? lead.siteId;
  const field = (name: string, value: string | null, inline = true) => ({ name, value: value || "—", inline });

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Securium Hub",
        // Les champs viennent d'un formulaire public : aucune mention (@everyone, rôles) ne doit notifier.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: `Nouveau lead · ${siteName}`,
            color: EMBED_COLOR,
            fields: [
              field("Nom", lead.name),
              field("Téléphone", lead.phone),
              field("Email", lead.email),
              field("Service", lead.service),
              field("Source", lead.source),
            ],
            footer: { text: lead.id },
            timestamp: lead.createdAt.toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[discord] lead ${lead.id} : webhook ${response.status}`);
  } catch (error) {
    console.error(`[discord] lead ${lead.id} :`, error);
  }
}
