import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { IAfluencerStudio, type ConnectionState } from "@/components/admin/IAfluencerStudio";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { connectedPlatforms } from "@/lib/social-accounts";
import { isPlatformConfigured } from "@/lib/social-oauth";

export const metadata: Metadata = {
  title: "IAfluencer · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts).
export const dynamic = "force-dynamic";

// Messages du retour OAuth (paramètre ?oauth=…). Aucun jeton ni secret n'apparaît ici.
const FEEDBACK: Record<string, string> = {
  ok: "Compte relié.",
  refuse: "Connexion refusée sur la plateforme.",
  etat_invalide: "Session de connexion expirée ou invalide : recommencez.",
  code_absent: "La plateforme n'a pas renvoyé d'autorisation.",
  non_configuree: "Application non configurée : renseignez ses variables dans .env.local ou Vercel.",
  echec: "Échec de la connexion : voir les journaux serveur.",
};

type Search = { oauth?: string; platform?: string };

// Lit les comptes en base. Si la lecture échoue (table absente, base injoignable), rien n'est affiché
// comme relié : le tableau de bord reste utilisable et signale l'état inconnu.
async function loadConnections(): Promise<{ connections: ConnectionState; databaseError: boolean }> {
  let linked = new Set<SocialPlatform>();
  let databaseError = false;
  try {
    linked = await connectedPlatforms();
  } catch (error) {
    databaseError = true;
    console.error("[iafluencer] lecture des comptes impossible :", error instanceof Error ? error.message : "erreur inconnue");
  }
  const entries = SOCIAL_PLATFORMS.map((platform) => {
    const state = linked.has(platform) ? "connectee" : isPlatformConfigured(platform) ? "non_connectee" : "non_configuree";
    return [platform, state] as const;
  });
  return { connections: Object.fromEntries(entries) as ConnectionState, databaseError };
}

const PILL = "glass-panel rounded-full px-3 py-1 text-xs text-foreground";

function ConnectionPill({ platform, state }: { platform: SocialPlatform; state: ConnectionState[SocialPlatform] }) {
  const label = PLATFORM_LABELS[platform];
  if (state === "connectee") {
    return <li className={PILL}>{label} · 🟢 Connecté</li>;
  }
  if (state === "non_connectee") {
    return (
      <li>
        <Link
          href={`/api/auth/${platform}`}
          className={`${PILL} transition-all duration-300 hover:shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--primary)_55%,transparent)] focus-visible:outline-2 focus-visible:outline-primary`}
        >
          {label} · 🔴 Non configuré · Connecter
        </Link>
      </li>
    );
  }
  return <li className={PILL}>{label} · 🔴 Non configuré · variables manquantes</li>;
}

export default async function IAfluencerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { connections, databaseError } = await loadConnections();
  const platform = SOCIAL_PLATFORMS.find((value) => value === params.platform);
  const feedback = params.oauth ? FEEDBACK[params.oauth] : undefined;

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
            {SOCIAL_PLATFORMS.map((value) => (
              <ConnectionPill key={value} platform={value} state={connections[value]} />
            ))}
          </ul>
        </header>

        {feedback && (
          <p role="status" className="glass-panel rounded-xl px-4 py-3 text-sm text-foreground">
            {platform ? `${PLATFORM_LABELS[platform]} : ` : ""}
            {feedback}
          </p>
        )}
        {databaseError && (
          <p role="alert" className="glass-panel rounded-xl px-4 py-3 text-sm text-muted-foreground">
            Base de données indisponible : l&apos;état des comptes n&apos;a pas pu être vérifié.
          </p>
        )}

        <IAfluencerStudio connections={connections} />
      </div>
    </main>
  );
}
