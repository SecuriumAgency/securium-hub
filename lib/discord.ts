import type { Lead } from "./generated/prisma/client";
import { callLink, countryOfSite, toE164, whatsappReplyLink } from "./lead-contact";
import { initialSites } from "./sites";

const TIMEOUT_MS = 5000;
const EMBED_COLOR = 0x22d3ee;

type LeadForDiscord = Pick<Lead, "id" | "siteId" | "name" | "phone" | "email" | "service" | "source" | "createdAt">;

// URL publique du Hub, pour le lien « Appeler » : domaine de production fourni par Vercel
// (VERCEL_PROJECT_PRODUCTION_URL). Absente en local : le lien est alors omis.
function hubOrigin(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : null;
}

// Corps du webhook Discord. Fonction pure, testée par scripts/lead-contact.test.mts.
export function buildDiscordPayload(lead: LeadForDiscord, origin: string | null) {
  const site = initialSites.find((item) => item.id === lead.siteId);
  const siteName = site?.name ?? lead.siteId;
  const country = countryOfSite(site?.url);
  const e164 = toE164(lead.phone, country);
  const field = (name: string, value: string | null, inline = true) => ({ name, value: value || "—", inline });

  // Liens en un clic pour rappeler dans la minute. Discord n'ouvre les liens masqués qu'en http(s).
  const call = callLink(e164, origin);
  const whatsapp = whatsappReplyLink(e164, country, lead.name, lead.service);
  const links = [call && `[📞 Appeler](${call})`, whatsapp && `[💬 WhatsApp](${whatsapp})`].filter(Boolean).join(" · ");

  return {
    username: "Securium Hub",
    // Les champs viennent d'un formulaire public : aucune mention (@everyone, rôles) ne doit notifier.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Nouveau lead · ${siteName}`,
        color: EMBED_COLOR,
        fields: [
          field("Nom", lead.name),
          field("Téléphone", e164 ?? lead.phone),
          field("Email", lead.email),
          field("Service", lead.service),
          field("Source", lead.source),
          ...(links ? [field("Rappeler", links, false)] : []),
        ],
        footer: { text: lead.id },
        timestamp: lead.createdAt.toISOString(),
      },
    ],
  };
}

// Publie le lead sur le salon Discord. Ne lève jamais : le lead est déjà enregistré, un échec
// Discord est seulement journalisé.
export async function notifyDiscord(lead: Lead) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.warn(`[discord] DISCORD_WEBHOOK_URL n'est pas défini : lead ${lead.id} non notifié.`);
    return;
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(lead, hubOrigin())),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[discord] lead ${lead.id} : webhook ${response.status}`);
  } catch (error) {
    console.error(`[discord] lead ${lead.id} :`, error);
  }
}
