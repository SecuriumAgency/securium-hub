import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { HubView } from "@/components/3d/HubView";

export const metadata: Metadata = {
  title: "Hub 3D · Securium Core",
};

// La HDRI locale est vérifiée au build : sans fichier, la scène n'émet aucune requête d'environnement.
// Après scripts/fetch-hub-env.mjs, un nouveau build l'active.
const HDRI_PRESENT = existsSync(path.join(process.cwd(), "public", "models", "env", "city.hdr"));

// Page protégée par la session admin (middleware) : la scène 3D n'est chargée qu'après le rendu de la page.
export default function HubPage() {
  return (
    <main className="min-h-dvh bg-slate-50">
      <HubView hdri={HDRI_PRESENT} />
    </main>
  );
}
