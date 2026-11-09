import type { Metadata } from "next";
import { HubView } from "@/components/3d/HubView";

export const metadata: Metadata = {
  title: "Hub 3D · Securium Core",
};

// Page protégée par la session admin (middleware) : la scène 3D n'est chargée qu'après le rendu de la page.
export default function HubPage() {
  return (
    <main className="min-h-dvh bg-slate-50">
      <HubView />
    </main>
  );
}
