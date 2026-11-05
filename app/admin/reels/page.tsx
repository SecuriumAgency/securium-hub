import type { Metadata } from "next";
import Image from "next/image";
import { AdminNav } from "@/components/admin/AdminNav";
import { Panel } from "@/components/admin/Panel";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionTabs } from "@/components/admin/SectionTabs";

export const metadata: Metadata = {
  title: "Reels Studio · Securium Core",
};

// Page statique : le moteur tourne en local (Securium-OS/reels-studio), il n'est pas exécuté par le hub.
const ETAPES = [
  { titre: "Script", detail: "OpenAI gpt-4o-mini, sortie JSON contrôlée : hook, body et callToAction." },
  { titre: "Voix", detail: "OpenAI tts-1 (voix onyx) : fichier MP3 du script complet." },
  { titre: "Texte", detail: "FFmpeg drawtext : hook centré, police Arial, fond semi-transparent." },
  { titre: "Montage", detail: "FFmpeg H.264 et AAC, format vertical 1080 × 1920, durée calée sur la voix." },
];

export default function ReelsPage() {
  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <PageHeader title="Reels Studio" description="Du sujet au Reel vertical : script, voix et texte à l’écran." />

        <SectionTabs
          label="Sections du Reels Studio"
          tabs={[
            {
              id: "visuel",
              label: "Visuel final",
              content: (
                <Panel id="reels-visuel" title="Visuel final" description="Image extraite d’un rendu FFmpeg, aux couleurs de la charte.">
                  <div className="mx-auto w-full max-w-sm">
                    <Image
                      src="/reels/studio-visuel.png"
                      alt="Image extraite d’un rendu : le texte « Ton site face à 100 visiteurs » sur fond sombre"
                      width={1080}
                      height={1920}
                      className="h-auto w-full rounded-xl border border-border transition-transform duration-500 hover:scale-[1.02]"
                    />
                  </div>
                </Panel>
              ),
            },
            {
              id: "pipeline",
              label: "Pipeline",
              count: ETAPES.length,
              content: (
                <Panel id="reels-pipeline" title="Pipeline" description="Quatre étapes, du script au fichier final.">
                  <ol className="grid gap-3 sm:grid-cols-2">
                    {ETAPES.map((etape, index) => (
                      <li key={etape.titre} className="flex gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/40">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary tabular-nums">
                          {index + 1}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-base font-medium text-foreground">{etape.titre}</p>
                          <p className="text-xs text-muted-foreground">{etape.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Panel>
              ),
            },
            {
              id: "lancer",
              label: "Lancer un Reel",
              content: (
                <Panel id="reels-lancer" title="Lancer un Reel" description="Le moteur tourne en local, sur le poste Securium.">
                  <p className="text-sm text-muted-foreground">
                    Il faut une clé OpenAI dont le compte a du crédit. Commande à lancer dans <code className="text-foreground">Securium-OS</code> :
                  </p>
                  <pre className="overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs text-foreground">
                    <code>{"cd C:\\Securium-Workspace\\Securium-OS\nnpx tsx scripts/build-reel.ts"}</code>
                  </pre>
                  <p className="text-xs text-muted-foreground">
                    Sortie : <code className="text-foreground">reels-studio/output/reel-final.mp4</code>, dossier ignoré par git.
                  </p>
                </Panel>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
