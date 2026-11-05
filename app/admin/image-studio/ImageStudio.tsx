"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Download, Loader2, Sparkles } from "lucide-react";
import { SuggestionChips, type Suggestion } from "@/components/admin/SuggestionChips";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const titreSection = "text-sm font-semibold uppercase tracking-wider text-primary";
const champ =
  "w-full rounded-xl border border-white/10 bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary";

const FORMATS = [
  { value: "carre", label: "Carré · 512 × 512", width: 512, height: 512 },
  { value: "portrait", label: "Portrait · 512 × 768", width: 512, height: 768 },
  { value: "paysage", label: "Paysage · 768 × 512", width: 768, height: 512 },
] as const;

// Prompts types, pré-sélectionnables : un clic remplit la description, qui reste modifiable.
const PROMPT_SUGGESTIONS: Suggestion[] = [
  { id: "maison", label: "Maison rénovée", value: "maison individuelle rénovée, façade blanche, pompe à chaleur air-eau, lumière douce de fin de journée, photographie architecturale" },
  { id: "combles", label: "Combles isolés", value: "combles isolés, laine de roche, charpente en bois, lumière d'atelier, vue détaillée, réalisme" },
  { id: "chantier", label: "Chantier soigné", value: "chantier de rénovation énergétique soigné, artisan en tenue de travail, matériel rangé, lumière naturelle" },
  { id: "logo", label: "Icône ambre", value: "icône minimaliste sur fond sombre, touches ambrées, style logo moderne, vectoriel net" },
];

type Statut = "inactif" | "en-cours" | "termine" | "erreur";

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["value"]>("carre");
  const [statut, setStatut] = useState<Statut>("inactif");
  const [image, setImage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const formatChoisi = FORMATS.find((item) => item.value === format) ?? FORMATS[0];
  const enCours = statut === "en-cours";

  async function generer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatut("en-cours");
    setErreur(null);
    try {
      const reponse = await fetch("/api/image-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, format }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { imageBase64?: string; error?: string };
      if (!reponse.ok || !donnees.imageBase64) {
        throw new Error(donnees.error ?? "La génération a échoué.");
      }
      setImage(`data:image/png;base64,${donnees.imageBase64}`);
      setStatut("termine");
    } catch (caught) {
      setErreur(caught instanceof Error ? caught.message : "La génération a échoué.");
      setStatut("erreur");
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
      <form onSubmit={generer} className={`${glass} flex flex-col gap-4`} aria-labelledby="image-prompt">
        <h2 id="image-prompt" className={titreSection}>
          Prompt
        </h2>

        <label className="flex flex-col gap-2 text-sm text-muted-foreground">
          Décrivez l’image
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            maxLength={1000}
            placeholder="Un château gothique au milieu d’une forêt brumeuse, lumière dorée, style concept art"
            className={champ}
          />
        </label>

        <SuggestionChips label="Suggestions de prompt" options={PROMPT_SUGGESTIONS} selected={prompt} onSelect={setPrompt} />

        <label className="flex flex-col gap-2 text-sm text-muted-foreground">
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className={champ}>
            {FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={enCours || prompt.trim().length === 0}
          className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-background transition-opacity focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enCours ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
          {enCours ? "Génération en cours…" : "Générer"}
        </button>

        {enCours && (
          <p className="text-xs text-muted-foreground" role="status">
            Le GPU génère l’image : environ 30 secondes par image.
          </p>
        )}
        {erreur && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {erreur}
          </p>
        )}
      </form>

      <section aria-labelledby="image-resultat" className={`${glass} flex flex-col gap-3`}>
        <h2 id="image-resultat" className={titreSection}>
          Résultat
        </h2>

        {image ? (
          <>
            <Image
              src={image}
              alt={`Image générée à partir du prompt : ${prompt}`}
              width={formatChoisi.width}
              height={formatChoisi.height}
              unoptimized
              className="h-auto w-full max-w-xl rounded-xl border border-white/10"
            />
            <a
              href={image}
              download="securium-image.png"
              className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl border border-primary/40 px-4 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Download aria-hidden className="size-4" />
              Télécharger le PNG
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune image pour l’instant. Le résultat s’affichera ici.</p>
        )}
      </section>
    </div>
  );
}
