"use client";

import { useState, type ReactNode } from "react";

type Mode = "immersive" | "synthesis";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "immersive", label: "Mode Immersif 3D (Sims)" },
  { value: "synthesis", label: "Mode Synthèse 2D" },
];

// Bascule entre la scène 3D plein écran et la grille 2D des modules. Les deux arbres sont passés par le serveur
// et seul celui du mode actif reste monté : le Canvas WebGL est libéré quand on passe en 2D.
export function EcosystemModeSwitch({ immersive, synthesis }: { immersive: ReactNode; synthesis: ReactNode }) {
  const [mode, setMode] = useState<Mode>("immersive");

  return (
    <>
      {mode === "immersive" ? immersive : synthesis}
      <div
        role="group"
        aria-label="Mode d'affichage"
        className="fixed bottom-4 right-4 z-[60] flex gap-1 rounded-xl border border-white/10 bg-slate-950/85 p-1 text-xs backdrop-blur-xl"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`min-h-11 rounded-lg px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              mode === option.value ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
