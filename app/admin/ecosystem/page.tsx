import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { HubView } from "@/components/3d/HubView";

export const metadata: Metadata = {
  title: "Écosystème · Securium Core",
};

// La HDRI locale est vérifiée au build, comme sur /hub.
const HDRI_PRESENT = existsSync(path.join(process.cwd(), "public", "models", "env", "city.hdr"));

// Écosystème : la ville 3D Kenney est la seule vue. Les anciens modes Matrix et Synthèse 2D ont été retirés.
export default function EcosystemPage() {
  return (
    <main className="min-h-dvh bg-slate-950">
      <HubView hdri={HDRI_PRESENT} />
    </main>
  );
}
