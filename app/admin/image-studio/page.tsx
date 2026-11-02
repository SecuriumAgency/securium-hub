import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ImageStudio } from "./ImageStudio";

export const metadata: Metadata = {
  title: "Images locales · Securium Core",
};

export default function ImageStudioPage() {
  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Images locales</h1>
          <p className="text-sm text-muted-foreground">
            Génération sur le poste Securium : moteur sd.cpp, modèle DreamShaper 8. Aucun service cloud, aucune clé API.
          </p>
        </header>

        <ImageStudio />
      </div>
    </main>
  );
}
