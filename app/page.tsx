import { existsSync } from "node:fs";
import path from "node:path";
import { HubView } from "@/components/3d/HubView";

// Racine : la ville Kenney unifiée, la même vue que /hub et /admin/ecosystem.
// La HDRI locale est vérifiée au build, comme sur /hub.
const HDRI_PRESENT = existsSync(path.join(process.cwd(), "public", "models", "env", "city.hdr"));

export default function Home() {
  return (
    <main className="min-h-dvh bg-slate-950">
      <HubView hdri={HDRI_PRESENT} />
    </main>
  );
}
