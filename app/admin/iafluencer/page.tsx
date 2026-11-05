import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { IAfluencerStudio, type ConnectionState } from "@/components/admin/IAfluencerStudio";
import { InstagramIcon, TikTokIcon } from "@/components/ui/SocialIcons";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { connectedAccounts } from "@/lib/social-accounts";
import { isPlatformConfigured } from "@/lib/social-oauth";

export const metadata: Metadata = {
  title: "IAfluencer · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts).
export const dynamic = "force-dynamic";

// Messages des retours OAuth (paramètre ?oauth=…). Aucun jeton ni secret n'apparaît ici.
const FEEDBACK: Record<string, string> = {
  ok: "Compte relié.",
  deconnecte: "Compte déconnecté.",
  refuse: "Connexion refusée sur la plateforme.",
  etat_invalide: "Session de connexion expirée ou invalide : recommencez.",
  code_absent: "La plateforme n'a pas renvoyé d'autorisation.",
  non_configuree: "Application non configurée : renseignez ses variables dans .env.local ou Vercel.",
  echec: "Échec de l'opération : voir les journaux serveur.",
};

type Search = { oauth?: string; platform?: string };

// Lit les comptes en base. Si la lecture échoue, rien n'est affiché comme relié : le tableau de bord
// reste utilisable et signale l'état inconnu.
async function loadConnections() {
  let accounts = new Map<SocialPlatform, string | null>();
  let databaseError = false;
  try {
    accounts = await connectedAccounts();
  } catch (error) {
    databaseError = true;
    console.error("[iafluencer] lecture des comptes impossible :", error instanceof Error ? error.message : "erreur inconnue");
  }
  const entries = SOCIAL_PLATFORMS.map((platform) => {
    const state = accounts.has(platform) ? "connectee" : isPlatformConfigured(platform) ? "non_connectee" : "non_configuree";
    return [platform, state] as const;
  });
  return { connections: Object.fromEntries(entries) as ConnectionState, accounts, databaseError };
}

const BOUTON =
  "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-primary";
const DESACTIVE =
  "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-500";
const PASTILLE = "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm text-emerald-200";

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return platform === "instagram" ? <InstagramIcon className={className} /> : <TikTokIcon className={className} />;
}

function ConnectionControl({
  platform,
  state,
  accountName,
}: {
  platform: SocialPlatform;
  state: ConnectionState[SocialPlatform];
  accountName: string | null | undefined;
}) {
  const label = PLATFORM_LABELS[platform];
  if (state === "connectee") {
    return (
      <li className="flex flex-wrap items-center gap-2">
        <span className={PASTILLE}>
          <PlatformIcon platform={platform} className="size-4" />
          🟢 {label} : {accountName ? `@${accountName}` : "connecté"}
        </span>
        <form method="post" action={`/api/auth/${platform}/disconnect`}>
          <button
            type="submit"
            className="min-h-[44px] rounded-xl border border-slate-700 px-4 text-sm text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
          >
            Se déconnecter
          </button>
        </form>
      </li>
    );
  }
  if (state === "non_connectee") {
    return (
      <li>
        <Link href={`/api/auth/${platform}`} prefetch={false} className={BOUTON}>
          <PlatformIcon platform={platform} className="size-4" />
          Connecter {label}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <span aria-disabled="true" className={DESACTIVE}>
        <PlatformIcon platform={platform} className="size-4" />
        {label} · application non configurée
      </span>
    </li>
  );
}

export default async function IAfluencerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { connections, accounts, databaseError } = await loadConnections();
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
          <ul aria-label="Connexions" className="flex flex-col gap-2 md:items-end">
            {SOCIAL_PLATFORMS.map((value) => (
              <ConnectionControl key={value} platform={value} state={connections[value]} accountName={accounts.get(value)} />
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
