"use client";

// Suggestions cliquables et pré-sélectionnables : un clic remplit le champ, un second clic le vide.
// La suggestion active est celle dont la valeur égale le champ, donc elle reste visible après un rechargement.
export type Suggestion = { id: string; label: string; value: string };

export function SuggestionChips({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Suggestion[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? "" : option.value)}
            className={`min-h-[36px] rounded-full border px-3 text-xs transition-all duration-300 focus-visible:outline-2 focus-visible:outline-primary ${
              active ? "glow-amber border-primary/60 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
