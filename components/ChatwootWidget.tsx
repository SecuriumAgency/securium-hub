"use client";

import Script from "next/script";

// Widget de chat en direct Chatwoot. Chargé par next/script en stratégie lazyOnload : le script ne part
// qu'une fois la page chargée et inactive, il ne bloque ni le rendu ni l'interactivité (Core Web Vitals).
// Seul le token public du site est utilisé (jamais un jeton d'API).
declare global {
  interface Window {
    chatwootSettings?: { position: "left" | "right"; type: "standard" | "expanded_bubble" };
    chatwootSDK?: { run: (config: { websiteToken: string; baseUrl: string }) => void };
  }
}

export default function ChatwootWidget() {
  const baseUrl = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;
  const websiteToken = process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;
  if (!baseUrl || !websiteToken) return null;

  // Réglages lus par le SDK au chargement : posés avant l'injection du script (next/script dédoublonne par id).
  if (typeof window !== "undefined") {
    window.chatwootSettings = { position: "right", type: "standard" };
  }

  return (
    <Script
      id="chatwoot-sdk"
      src={`${baseUrl}/packs/js/sdk.js`}
      strategy="lazyOnload"
      onLoad={() => window.chatwootSDK?.run({ websiteToken, baseUrl })}
    />
  );
}
