const TIMEOUT_MS = 5000;

// Alerte texte sur le salon Discord du Hub. Ne lève jamais : une alerte manquée ne doit pas faire échouer
// la tâche planifiée, qui a déjà enregistré son relevé.
export async function notifyAlert(title: string, description: string): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.warn(`[alerts] DISCORD_WEBHOOK_URL n'est pas défini : alerte « ${title} » non envoyée.`);
    return;
  }
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Securium Hub",
        // Aucune mention (@everyone, rôles) : le texte peut venir de données externes.
        allowed_mentions: { parse: [] },
        embeds: [{ title, description, color: 0xf87171, timestamp: new Date().toISOString() }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[alerts] envoi impossible :", error);
  }
}
