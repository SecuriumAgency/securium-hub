import type { Metadata } from "next";
import Image from "next/image";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = {
  title: "Reels Studio · Securium Core",
};

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const titreSection = "text-sm font-semibold uppercase tracking-wider text-primary";

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

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Reels Studio</h1>
          <p className="text-sm text-muted-foreground">Du sujet au Reel vertical : script, voix et texte à l’écran.</p>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
          <section aria-labelledby="reels-visuel" className={`${glass} flex flex-col gap-3`}>
            <h2 id="reels-visuel" className={titreSection}>
              Visuel final
            </h2>
            <Image
              src="/reels/studio-visuel.png"
              alt="Image extraite d’un rendu : le texte « Ton site face à 100 visiteurs » sur fond sombre"
              width={1080}
              height={1920}
              className="h-auto w-full rounded-xl border border-white/10"
            />
            <p className="text-xs text-muted-foreground">Image extraite d’un rendu FFmpeg, aux couleurs de la charte.</p>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="reels-pipeline" className={`${glass} flex flex-col gap-4`}>
              <h2 id="reels-pipeline" className={titreSection}>
                Pipeline
              </h2>
              <ol className="grid gap-3 sm:grid-cols-2">
                {ETAPES.map((etape, index) => (
                  <li key={etape.titre} className="flex gap-3 rounded-xl border border-white/10 p-3">
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
            </section>

            <section aria-labelledby="reels-lancer" className={`${glass} flex flex-col gap-3`}>
              <h2 id="reels-lancer" className={titreSection}>
                Lancer un Reel
              </h2>
              <p className="text-sm text-muted-foreground">
                Le moteur tourne en local, dans <code className="text-foreground">Securium-OS/reels-studio</code>. Il faut une clé
                OpenAI dont le compte a du crédit.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-background p-3 text-xs text-foreground">
                <code>{"cd C:\\Securium-Workspace\\Securium-OS\nnpx tsx scripts/build-reel.ts"}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                Sortie : <code className="text-foreground">reels-studio/output/reel-final.mp4</code>, dossier ignoré par git.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
