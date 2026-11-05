"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

// Catégories du workboard. Le libellé s'affiche tel quel ; l'identifiant sert au tri et au style.
export const WORKBOARD_CATEGORIES = [
  { id: "dev", label: "Dev", style: "border-primary/30 bg-primary/10 text-primary" },
  { id: "prospection", label: "Prospection", style: "border-success/30 bg-success/10 text-success" },
  { id: "admin", label: "Admin", style: "border-border bg-muted text-foreground" },
  { id: "coaching", label: "Spiritualité · Coaching Ilyas", style: "border-draft/30 bg-draft/10 text-draft" },
] as const;

export type WorkboardCategory = (typeof WORKBOARD_CATEGORIES)[number]["id"];

export type WorkTask = { id: string; title: string; category: WorkboardCategory; done: boolean };

type Action =
  | { type: "load"; tasks: WorkTask[] }
  | { type: "add"; task: WorkTask }
  | { type: "toggle"; id: string }
  | { type: "remove"; id: string };

// Réducteur pur : chaque action répond tout de suite, sans aller-retour réseau ni rechargement.
export function workboardReducer(tasks: WorkTask[], action: Action): WorkTask[] {
  switch (action.type) {
    case "load":
      return action.tasks;
    case "add":
      return [...tasks, action.task];
    case "toggle":
      return tasks.map((task) => (task.id === action.id ? { ...task, done: !task.done } : task));
    case "remove":
      return tasks.filter((task) => task.id !== action.id);
  }
}

// Avancement de la journée : part des tâches cochées, 0 % quand la liste est vide.
export function dailyProgress(tasks: WorkTask[]) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

// Clé de jour à Paris, AAAA-MM-JJ : la liste repart à zéro chaque jour, les tâches de la veille restent en mémoire.
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export function storageKey(now: Date) {
  return `securium-workboard:${dayFormat.format(now)}`;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function isWorkTask(value: unknown): value is WorkTask {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.done === "boolean" &&
    WORKBOARD_CATEGORIES.some((category) => category.id === task.category)
  );
}

export function DailyWorkboard() {
  const [tasks, dispatch] = useReducer(workboardReducer, []);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WorkboardCategory>("dev");

  // Chargement de la liste du jour, une fois côté navigateur. Le stockage peut être bloqué : on repart alors à vide.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(new Date()));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) dispatch({ type: "load", tasks: parsed.filter(isWorkTask) });
    } catch {
      // Lecture impossible (stockage bloqué, JSON altéré) : la liste reste vide pour cette visite.
    }
    setLoaded(true);
  }, []);

  // Sauvegarde après chaque changement, une fois le chargement terminé pour ne pas écraser la liste.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey(new Date()), JSON.stringify(tasks));
    } catch {
      // Stockage indisponible : la liste fonctionne quand même, sans persistance.
    }
  }, [tasks, loaded]);

  const progress = dailyProgress(tasks);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    dispatch({ type: "add", task: { id: newId(), title: trimmed.slice(0, 160), category, done: false } });
    setTitle("");
  }

  return (
    <section aria-labelledby="workboard-title" className="glass-panel flex flex-col gap-5 rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <h2 id="workboard-title" className="text-lg font-semibold text-foreground md:text-xl">
          Workboard du jour
        </h2>
        <p className="text-sm tabular-nums text-muted-foreground">
          {progress.done} / {progress.total} terminées
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progression</span>
          <span className="tabular-nums text-foreground">{progress.percent} %</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progression de la journée"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary shadow-[0_0_12px_var(--primary)] transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 md:flex-row">
        <label className="sr-only" htmlFor="workboard-new">
          Nouvelle tâche
        </label>
        <input
          id="workboard-new"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="Ajouter une tâche"
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
        />
        <label className="sr-only" htmlFor="workboard-category">
          Catégorie
        </label>
        <select
          id="workboard-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as WorkboardCategory)}
          className="min-h-[44px] rounded-lg border border-border bg-muted px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          {WORKBOARD_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm text-primary transition-all duration-300 hover:shadow-[0_0_18px_-6px_var(--primary)] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus aria-hidden className="size-4" />
          Ajouter
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Aucune tâche pour aujourd&apos;hui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {tasks.map((task) => {
            const meta = WORKBOARD_CATEGORIES.find((item) => item.id === task.category);
            return (
              <li key={task.id} className="flex min-w-0 items-center gap-3 py-2.5">
                <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => dispatch({ type: "toggle", id: task.id })}
                    className="size-4 shrink-0 accent-amber-500"
                  />
                  <span className={`min-w-0 break-words text-sm ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {task.title}
                  </span>
                </label>
                {meta && (
                  <span className={`hidden shrink-0 rounded-md border px-2 py-0.5 text-xs sm:inline-flex ${meta.style}`}>{meta.label}</span>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "remove", id: task.id })}
                  aria-label={`Supprimer « ${task.title} »`}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
