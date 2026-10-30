import type { MetadataRoute } from "next";

// Adresse du QG, comme dans lib/mock-data.json.
const HUB_URL = "https://hub.securium-agency.fr";

// Une seule page publique : la connexion. Les autres routes sont protégées par la session admin.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${HUB_URL}/login`, changeFrequency: "yearly", priority: 0.3 }];
}
