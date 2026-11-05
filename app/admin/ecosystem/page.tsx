import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { EcosystemGrid } from "@/components/admin/EcosystemGrid";
import { LiveBadge, PageHeader } from "@/components/admin/PageHeader";
import { INTEGRATION_MODULES } from "@/lib/integrations/modules";

export const metadata: Metadata = {
  title: "Écosystème · Securium Core",
};

// Lue à chaque visite : les adresses viennent de l'environnement du serveur, et l'état est interrogé à part.
export const dynamic = "force-dynamic";

// Seule l'adresse publique (`<PREFIXE>_PUBLIC_URL`) part vers le navigateur : l'adresse interne reste côté serveur.
export default function EcosystemPage() {
  const modules = INTEGRATION_MODULES.map((module) => ({
    ...module,
    openUrl: process.env[`${module.prefix}_PUBLIC_URL`]?.trim() || null,
  }));

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <PageHeader
          title="Écosystème"
          description="Les modules de l'agence, reliés au Hub."
          live={<LiveBadge label="État des modules en direct" />}
        />

        <EcosystemGrid modules={modules} />
      </div>
    </main>
  );
}
