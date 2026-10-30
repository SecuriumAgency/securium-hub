import type { MetadataRoute } from "next";

// Adresse du QG, comme dans lib/mock-data.json.
const HUB_URL = "https://hub.securium-agency.fr";

// Le hub est un outil privé : seule la page de connexion se lit, le reste reste hors des moteurs.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/login", disallow: "/" },
    sitemap: `${HUB_URL}/sitemap.xml`,
  };
}
