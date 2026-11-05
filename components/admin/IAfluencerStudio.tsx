"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { CalendarDays, Film, Plus, Upload } from "lucide-react";
import { BIO_LIMITS, CAPTION_MAX, PLATFORM_LABELS, SOCIAL_PLATFORMS, bioErrors, type SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { validateUpload } from "@/lib/media/upload-rules";
import { IAfluencerAutopilot, type AutopilotSettings } from "@/components/admin/IAfluencerAutopilot";

// non_configuree : l'application OAuth n'a pas ses identifiants. non_connectee : identifiants présents, aucun compte relié.
// connectee : compte relié.
export type ConnectionState = Record<SocialPlatform, "non_configuree" | "non_connectee" | "connectee">;

export type RushItem = { id: string; fileName: string; url: string; sizeMb: number; createdAt: string };
type PostItem = { id: string; platform: string; format: string; source: string; rushName: string | null; scheduledAt: string; status: string; error: string | null };

const panelClass = "glass-panel flex min-w-0 flex-col gap-4 rounded-2xl p-5 md:p-6";
const sectionTitle = "text-sm font-semibold uppercase tracking-[0.2em] text-primary";
const fieldClass =
  "min-h-[44px] min-w-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary";
const primaryButton =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm text-primary transition-all duration-300 hover:shadow-[0_0_18px_-6px_var(--primary)] focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none";

export function IAfluencerStudio({
  connections,
  settings,
  initialBio,
}: {
  connections: ConnectionState;
  settings: AutopilotSettings;
  initialBio: string;
}) {
  const [rushes, setRushes] = useState<RushItem[]>([]);

  const refreshRushes = useCallback(async () => {
    try {
      const response = await fetch("/api/rushes", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { rushes: RushItem[] };
      setRushes(body.rushes);
    } catch {
      // Liste indisponible : les rushs déjà affichés restent visibles.
    }
  }, []);

  useEffect(() => {
    void refreshRushes();
  }, [refreshRushes]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RushDropzone rushes={rushes} onRegistered={refreshRushes} />
      <BrandControl connections={connections} settings={settings} initialBio={initialBio} />
      <ContentGrid rushes={rushes} />
    </div>
  );
}

// ---------- Section 1 : rushs ----------

type UploadState = "uploading" | "registering" | "done" | "error";
type UploadItem = { id: string; name: string; progress: number; state: UploadState; error: string | null };

// Nom sûr pour le stockage : lettres, chiffres, point, tiret et souligné, extension en minuscules.
function storageName(name: string): { pathname: string; contentType: "video/mp4" | "video/quicktime" } {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "rush";
  const extension = name.slice(dot + 1).toLowerCase() === "mov" ? "mov" : "mp4";
  return { pathname: `rushs/${base}.${extension}`, contentType: extension === "mov" ? "video/quicktime" : "video/mp4" };
}

function RushDropzone({ rushes, onRegistered }: { rushes: RushItem[]; onRegistered: () => Promise<void> }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  function patch(id: string, change: Partial<UploadItem>) {
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  async function sendFile(file: File, id: string) {
    const { pathname, contentType } = storageName(file.name);
    try {
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType,
        onUploadProgress: ({ percentage }) => patch(id, { progress: Math.round(percentage) }),
      });
      patch(id, { state: "registering", progress: 100 });
      const response = await fetch("/api/rushes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: blob.url,
          fileName: file.name,
          sizeMb: Math.max(1, Math.round(file.size / 1024 / 1024)),
          contentType,
        }),
      });
      if (!response.ok) throw new Error("Enregistrement du rush refusé.");
      patch(id, { state: "done" });
      await onRegistered();
    } catch (error) {
      patch(id, { state: "error", error: error instanceof Error ? error.message : "Envoi impossible." });
    }
  }

  function addFiles(files: File[]) {
    const nextErrors: string[] = [];
    const started: { file: File; id: string }[] = [];
    for (const file of files) {
      const check = validateUpload({ name: file.name, size: file.size });
      if (!check.ok) {
        nextErrors.push(`${file.name} : ${check.error}`);
        continue;
      }
      started.push({ file, id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    }
    setErrors(nextErrors);
    setUploads((current) => [...current, ...started.map(({ file, id }) => ({ id, name: file.name, progress: 0, state: "uploading" as const, error: null }))]);
    for (const { file, id } of started) void sendFile(file, id);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  const active = uploads.filter((item) => item.state !== "done");

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

      {active.length > 0 && (
        <ul className="flex flex-col gap-3">
          {active.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{item.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {item.state === "error" ? "Échec" : item.state === "registering" ? "Enregistrement…" : `${item.progress} %`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Envoi de ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progress}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div className={`h-full transition-all duration-300 ${item.state === "error" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${item.progress}%` }} />
              </div>
              {item.error && <p className="text-xs text-destructive">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {rushes.length === 0 && active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rush déposé pour le moment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rushes.map((rush) => (
            <li key={rush.id} className="flex min-w-0 items-center gap-3 py-2.5">
              <Film aria-hidden className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{rush.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {rush.sizeMb} Mo · déposé le {formatDay(new Date(rush.createdAt))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Section 2 : biographie synchronisée ----------

function BrandControl({ connections, settings, initialBio }: { connections: ConnectionState; settings: AutopilotSettings; initialBio: string }) {
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const problems = SOCIAL_PLATFORMS.flatMap((platform) => bioErrors(platform, bio));
  const anyConnected = SOCIAL_PLATFORMS.some((platform) => connections[platform] === "connectee");
  const connectedNames = SOCIAL_PLATFORMS.filter((platform) => connections[platform] === "connectee").map((platform) => PLATFORM_LABELS[platform]);
  const canSync = bio.trim().length > 0 && problems.length === 0 && anyConnected && !busy;

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/social/update-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setMessage(response.ok ? { kind: "ok", text: body.message ?? "Bio enregistrée." } : { kind: "error", text: body.error ?? "Enregistrement impossible." });
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusy(false);
    }
  }

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

      <IAfluencerAutopilot initial={settings} />

      <div className="mt-auto flex flex-col gap-2">
        <button type="button" onClick={sync} disabled={!canSync} className={primaryButton}>
          {busy ? "Enregistrement…" : "Synchroniser sur Instagram et TikTok"}
        </button>
        <p className="text-xs text-muted-foreground">
          {anyConnected
            ? `Connectés : ${connectedNames.join(", ")}. La bio est enregistrée ; son envoi vers les profils n'est pas encore branché.`
            : "Synchronisation désactivée : aucun compte n'est encore connecté (voir l'état des connexions ci-dessus)."}
        </p>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-foreground"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------- Section 3 : calendrier ----------

const STATUS_LABEL: Record<string, string> = { PENDING: "En attente", PUBLISHED: "Publié", FAILED: "Échec" };

function ContentGrid({ rushes }: { rushes: RushItem[] }) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [kind, setKind] = useState<"post" | "story">("post");
  const [date, setDate] = useState(() => toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [time, setTime] = useState("10:00");
  const [rushId, setRushId] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const response = await fetch("/api/posts", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { posts: PostItem[] };
      setPosts(body.posts);
    } catch {
      // Calendrier indisponible : la grille reste vide sans bloquer le formulaire.
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  // Rush par défaut : le plus récent, dès qu'il existe.
  const selectedRush = rushId || rushes[0]?.id || "";
  // Les Stories n'existent pas sur TikTok : le type revient à « Publication ».
  const effectiveKind = platform === "tiktok" ? "post" : kind;

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => new Date(start.getTime() + index * 86_400_000));
  }, []);

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!selectedRush) return setMessage({ kind: "error", text: "Déposez d'abord un rush." });
    if (caption.trim().length > CAPTION_MAX) return setMessage({ kind: "error", text: `La légende dépasse ${CAPTION_MAX} caractères.` });
    setBusy(true);
    try {
      const response = await fetch("/api/posts/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          format: effectiveKind === "story" ? "STORIES" : "FEED",
          rushId: selectedRush,
          date,
          time,
          caption: caption.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "Planification impossible." });
        return;
      }
      setCaption("");
      setMessage({ kind: "ok", text: `Planifié le ${formatDateFr(date)} à ${time} (heure de Paris).` });
      await loadPosts();
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." });
    } finally {
      setBusy(false);
    }
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
        <label className="sr-only" htmlFor="post-kind">Type de publication</label>
        <select id="post-kind" value={effectiveKind} onChange={(event) => setKind(event.target.value as "post" | "story")} className={`${fieldClass} md:col-span-1`}>
          <option value="post">Publication</option>
          {platform === "instagram" && <option value="story">Story</option>}
        </select>
        <label className="sr-only" htmlFor="post-date">Date</label>
        <input id="post-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${fieldClass} md:col-span-1`} />
        <label className="sr-only" htmlFor="post-time">Heure</label>
        <input id="post-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className={`${fieldClass} md:col-span-1`} />
        <label className="sr-only" htmlFor="post-rush">Rush</label>
        <select id="post-rush" value={selectedRush} onChange={(event) => setRushId(event.target.value)} disabled={rushes.length === 0} className={`${fieldClass} md:col-span-2`}>
          {rushes.length === 0 && <option value="">Aucun rush déposé</option>}
          {rushes.map((rush) => (
            <option key={rush.id} value={rush.id}>{rush.fileName}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="post-caption">Légende</label>
        <textarea
          id="post-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={2}
          placeholder="Légende (facultative : générée automatiquement si vide)"
          className="min-w-0 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary md:col-span-5"
        />
        <button type="submit" disabled={busy || !selectedRush} className={`${primaryButton} md:col-span-1`}>
          <Plus aria-hidden className="size-4" />
          {busy ? "…" : "Planifier"}
        </button>
      </form>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message.text}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays aria-hidden className="size-4" />
        Publications enregistrées sur le serveur. Le moteur les publie à l&apos;heure prévue.
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const items = posts.filter((post) => sameDay(new Date(post.scheduledAt), day)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          return (
            <li key={day.toISOString()} className="flex min-h-24 min-w-0 flex-col gap-1 rounded-xl border border-border bg-muted/30 p-2">
              <span className="text-xs font-medium text-muted-foreground">{formatDay(day)}</span>
              {items.map((post) => (
                <div
                  key={post.id}
                  title={post.error ?? undefined}
                  className={`flex min-w-0 flex-col rounded-md border px-1.5 py-1 text-[0.7rem] ${
                    post.status === "FAILED" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/10 text-primary"
                  }`}
                >
                  <span className="truncate">
                    {formatTime(new Date(post.scheduledAt))} {PLATFORM_LABELS[post.platform as SocialPlatform] ?? post.platform}
                    {post.format === "STORIES" ? " · Story" : ""}
                  </span>
                  <span className="truncate opacity-80">{STATUS_LABEL[post.status] ?? post.status}</span>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function toDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateFr(input: string) {
  const [year, month, day] = input.split("-");
  return `${day}/${month}/${year}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
function formatDay(date: Date) {
  return dayFormatter.format(date);
}
function formatTime(date: Date) {
  return timeFormatter.format(date);
}
