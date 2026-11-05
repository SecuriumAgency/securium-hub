import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { IAfluencerStudio, type ConnectionState } from "@/components/admin/IAfluencerStudio";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/agents/iafluencer-rules";

export const metadata: Metadata = {
  title: "IAfluencer · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts).
export const dynamic = "force-dynamic";

// Seule la présence des identifiants OAuth sort du serveur, jamais leur valeur.
function connectionStates(): ConnectionState {
  const meta = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  const tiktok = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  return {
    instagram: meta ? "non_connectee" : "non_configuree",
    tiktok: tiktok ? "non_connectee" : "non_configuree",
  };
}

const stateLabel: Record<ConnectionState["instagram"], string> = {
  non_configuree: "Application non configurée",
  non_connectee: "Aucun compte relié",
  connectee: "Connecté",
};

export default function IAfluencerPage() {
  const connections = connectionStates();

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Social media automation</p>
            <h1 className="text-2xl font-semibold text-foreground md:text-4xl">IAfluencer</h1>
            <p className="text-sm text-muted-foreground">Rushs, biographie et calendrier des publications.</p>
          </div>
          <ul aria-label="Connexions" className="flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <li
                key={platform}
                className="glass-panel rounded-full px-3 py-1 text-xs text-foreground"
              >
                {PLATFORM_LABELS[platform]} · {stateLabel[connections[platform]]}
              </li>
            ))}
          </ul>
        </header>

        <IAfluencerStudio connections={connections} />
      </div>
    </main>
  );
}
