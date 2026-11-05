"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { CalendarDays, Film, Plus, Trash2, Upload } from "lucide-react";
import {
  BIO_LIMITS,
  CAPTION_MAX,
  DEFAULT_POLICIES,
  PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  bioErrors,
  nextSlot,
  type ScheduledPost,
  type SocialPlatform,
} from "@/lib/agents/iafluencer-rules";
import { MAX_RUSH_BYTES, validateUpload } from "@/lib/media/upload-rules";

// non_configuree : l'application OAuth n'a pas ses identifiants. non_connectee : identifiants présents, aucun compte relié.
// connectee : compte relié (aucun flux ne le produit encore).
export type ConnectionState = Record<SocialPlatform, "non_configuree" | "non_connectee" | "connectee">;

const panelClass = "glass-panel flex min-w-0 flex-col gap-4 rounded-2xl p-5 md:p-6";
const sectionTitle = "text-sm font-semibold uppercase tracking-[0.2em] text-primary";
const fieldClass =
  "min-h-[44px] min-w-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary";
const primaryButton =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm text-primary transition-all duration-300 hover:shadow-[0_0_18px_-6px_var(--primary)] focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none";

export function IAfluencerStudio({ connections }: { connections: ConnectionState }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RushDropzone />
      <BrandControl connections={connections} />
      <ContentGrid />
    </div>
  );
}

// ---------- Section 1 : rushs ----------

type Rush = { id: string; name: string; size: number };

function RushDropzone() {
  const [rushes, setRushes] = useState<Rush[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(files: File[]) {
    const nextErrors: string[] = [];
    const accepted: Rush[] = [];
    for (const file of files) {
      const check = validateUpload({ name: file.name, size: file.size });
      if (check.ok) accepted.push({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size });
      else nextErrors.push(`${file.name} : ${check.error}`);
    }
    setErrors(nextErrors);
    setRushes((current) => {
      const known = new Set(current.map((rush) => rush.id));
      return [...current, ...accepted.filter((rush) => !known.has(rush.id))];
    });
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section aria-labelledby="rushs-title" className={panelClass}>
      <h2 id="rushs-title" className={sectionTitle}>
        Dropzone rushs
      </h2>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-all duration-300 ${
          dragging ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_var(--primary)]" : "border-border bg-muted/30 hover:border-primary/40"
        }`}
      >
        <Upload aria-hidden className="size-6 text-primary" />
        <span className="text-sm text-foreground">Glisser les rushs ici, ou choisir des fichiers</span>
        <span className="text-xs text-muted-foreground">.mp4 ou .mov, 2 Go maximum par fichier</span>
        <input
          type="file"
          accept=".mp4,.mov,video/mp4,video/quicktime"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {rushes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rush déposé pour le moment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rushes.map((rush) => (
            <li key={rush.id} className="flex min-w-0 items-center gap-3 py-2.5">
              <Film aria-hidden className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{rush.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(rush.size / 1024 / 1024).toFixed(1)} Mo · en attente du poste de traitement ({Math.round(MAX_RUSH_BYTES / 1024 ** 3)} Go max)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRushes((current) => current.filter((item) => item.id !== rush.id))}
                aria-label={`Retirer ${rush.name}`}
                className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Section 2 : biographie synchronisée ----------

function BrandControl({ connections }: { connections: ConnectionState }) {
  const [bio, setBio] = useState("");
  const problems = SOCIAL_PLATFORMS.flatMap((platform) => bioErrors(platform, bio));
  const allConnected = SOCIAL_PLATFORMS.every((platform) => connections[platform] === "connectee");

  return (
    <section aria-labelledby="brand-title" className={panelClass}>
      <h2 id="brand-title" className={sectionTitle}>
        Brand control
      </h2>

      <label htmlFor="brand-bio" className="text-sm text-foreground">
        Biographie commune
      </label>
      <textarea
        id="brand-bio"
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        rows={3}
        className="min-w-0 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
        placeholder="Une bio courte, valable sur Instagram et TikTok"
      />

      <ul className="flex flex-col gap-2 text-xs">
        {SOCIAL_PLATFORMS.map((platform) => {
          const length = [...bio.trim()].length;
          const over = length > BIO_LIMITS[platform];
          return (
            <li key={platform} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {PLATFORM_LABELS[platform]} : {BIO_LIMITS[platform]} caractères maximum
              </span>
              <span className={`tabular-nums ${over ? "text-destructive" : "text-foreground"}`}>
                {length} / {BIO_LIMITS[platform]}
              </span>
            </li>
          );
        })}
      </ul>

      {problems.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {problems.join(" ")}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <button type="button" disabled={problems.length > 0 || !allConnected} className={primaryButton}>
          Synchroniser sur Instagram et TikTok
        </button>
        <p className="text-xs text-muted-foreground">
          {allConnected
            ? "Synchronisation prête."
            : "Synchronisation désactivée : les comptes ne sont pas encore connectés (voir l'état des connexions ci-dessus)."}
        </p>
      </div>
    </section>
  );
}

// ---------- Section 3 : calendrier ----------

function ContentGrid() {
  const [entries, setEntries] = useState<ScheduledPost[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [kind, setKind] = useState<"post" | "story">("post");
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => new Date(start.getTime() + index * 86_400_000));
  }, []);

  function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = caption.trim();
    if (!text) return setMessage("La légende est vide.");
    if (text.length > CAPTION_MAX) return setMessage(`La légende dépasse ${CAPTION_MAX} caractères.`);
    if (!media.trim()) return setMessage("Indiquez le rush associé.");
    const requested = new Date(when);
    if (Number.isNaN(requested.getTime())) return setMessage("Date invalide.");

    // Même règle que le moteur : espacement minimal et plafond sur 24 h, gigue comprise.
    const sameNetwork = entries.filter((entry) => entry.platform === platform && entry.status !== "annulee");
    const latest = sameNetwork.reduce<Date | null>((max, entry) => (max === null || entry.at > max ? entry.at : max), null);
    // Fenêtre des 24 h qui précèdent la demande, comme dans le moteur.
    const recentAt = sameNetwork
      .filter((entry) => entry.at.getTime() >= requested.getTime() - 86_400_000)
      .map((entry) => entry.at);
    const at = nextSlot({ requestedAt: requested, lastAt: latest, recentAt, policy: DEFAULT_POLICIES[platform], random: Math.random });

    setEntries((current) => [
      ...current,
      { id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), platform, kind, caption: text, mediaName: media, at, status: "planifiee" },
    ]);
    setCaption("");
    setMessage(`Planifié le ${formatDay(at)} à ${formatTime(at)}, décalé de ${Math.round((at.getTime() - requested.getTime()) / 60_000)} min pour respecter le rythme.`);
  }

  return (
    <section aria-labelledby="grid-title" className={`${panelClass} xl:col-span-2`}>
      <h2 id="grid-title" className={sectionTitle}>
        Content grid
      </h2>

      <form onSubmit={schedule} className="grid grid-cols-1 gap-2 md:grid-cols-6">
        <label className="sr-only" htmlFor="post-platform">Plateforme</label>
        <select id="post-platform" value={platform} onChange={(event) => setPlatform(event.target.value as SocialPlatform)} className={`${fieldClass} md:col-span-1`}>
          {SOCIAL_PLATFORMS.map((item) => (
            <option key={item} value={item}>{PLATFORM_LABELS[item]}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="post-kind">Type</label>
        <select id="post-kind" value={kind} onChange={(event) => setKind(event.target.value as "post" | "story")} className={`${fieldClass} md:col-span-1`}>
          <option value="post">Publication</option>
          <option value="story">Story</option>
        </select>
        <label className="sr-only" htmlFor="post-when">Date et heure souhaitées</label>
        <input id="post-when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className={`${fieldClass} md:col-span-2`} />
        <label className="sr-only" htmlFor="post-media">Rush</label>
        <input id="post-media" value={media} onChange={(event) => setMedia(event.target.value)} placeholder="Nom du rush" className={`${fieldClass} md:col-span-2`} />
        <label className="sr-only" htmlFor="post-caption">Légende</label>
        <textarea id="post-caption" value={caption} onChange={(event) => setCaption(event.target.value)} rows={2} placeholder="Légende" className="min-w-0 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary md:col-span-5" />
        <button type="submit" className={`${primaryButton} md:col-span-1`}>
          <Plus aria-hidden className="size-4" />
          Planifier
        </button>
      </form>

      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays aria-hidden className="size-4" />
        File locale : les publications ne sont enregistrées que dans cette page, jusqu&apos;au branchement de la file serveur.
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const items = entries.filter((entry) => sameDay(entry.at, day)).sort((a, b) => a.at.getTime() - b.at.getTime());
          return (
            <li key={day.toISOString()} className="flex min-h-24 min-w-0 flex-col gap-1 rounded-xl border border-border bg-muted/30 p-2">
              <span className="text-xs font-medium text-muted-foreground">{formatDay(day)}</span>
              {items.map((entry) => (
                <div key={entry.id} className="flex min-w-0 items-center justify-between gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-1 text-[0.7rem] text-primary">
                  <span className="truncate">{formatTime(entry.at)} {PLATFORM_LABELS[entry.platform]}</span>
                  <button
                    type="button"
                    onClick={() => setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, status: "annulee" } : item)))}
                    aria-label={`Annuler la publication de ${formatTime(entry.at)}`}
                    className="shrink-0 cursor-pointer rounded px-1 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
function formatDay(date: Date) {
  return dayFormatter.format(date);
}
function formatTime(date: Date) {
  return timeFormatter.format(date);
}
