import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { SeoDashboard } from "@/components/admin/SeoDashboard";
import { auditSite } from "@/lib/seo/audit";
import type { SeoAudit } from "@/lib/seo/checks";
import { initialSites } from "@/lib/sites";

export const metadata: Metadata = {
  title: "Audit SEO · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : l'audit interroge le site en direct.
export const dynamic = "force-dynamic";

// Un site à la fois, choisi par ?site=. Les sites sans URL de production ne figurent pas dans la liste.
export default async function SeoPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site: requested } = await searchParams;
  const sites = initialSites.flatMap((site) => (site.url ? [{ id: site.id, name: site.name, url: site.url }] : []));
  const selected = sites.find((site) => site.id === requested) ?? sites[0] ?? null;

  let audit: SeoAudit | null = null;
  let error: string | null = null;
  if (selected) {
    try {
      audit = await auditSite(selected);
    } catch (cause) {
      console.error("[seo] audit impossible :", cause);
      error = "L’audit n’a pas pu aboutir. Réessayez dans un instant.";
    }
  }

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Audit SEO</h1>
          <p className="text-sm text-muted-foreground">
            Onze contrôles par site de la flotte, sur le HTML et les fichiers robots.txt et sitemap.xml du site.
          </p>
        </header>

        <SeoDashboard
          sites={sites.map(({ id, name }) => ({ id, name }))}
          selectedId={selected?.id ?? null}
          audit={audit}
          error={error}
        />
      </div>
    </main>
  );
}
