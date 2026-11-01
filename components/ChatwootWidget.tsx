"use client";

import { useEffect } from "react";

// Widget de chat en direct Chatwoot. Le script est ajouté après le premier rendu, sans bloquer le chargement :
// il ne doit pas peser sur les Core Web Vitals. Seul le token public du site est utilisé (jamais un jeton d'API).
declare global {
  interface Window {
    chatwootSettings?: { position: "left" | "right"; type: "standard" | "expanded_bubble" };
    chatwootSDK?: { run: (config: { websiteToken: string; baseUrl: string }) => void };
  }
}

export default function ChatwootWidget() {
  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;
    const websiteToken = process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;
    if (!baseUrl || !websiteToken) return;
    if (document.getElementById("chatwoot-sdk")) return;

    window.chatwootSettings = { position: "right", type: "standard" };

    const script = document.createElement("script");
    script.id = "chatwoot-sdk";
    script.src = `${baseUrl}/packs/js/sdk.js`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.chatwootSDK?.run({ websiteToken, baseUrl });
    };
    document.body.appendChild(script);
  }, []);

  return null;
}
