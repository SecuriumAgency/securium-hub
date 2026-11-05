import type { ReactNode } from "react";

// En-tête commun des pages admin : surtitre, titre, description et, à droite, actions ou état en direct.
export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
  live,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  live?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-foreground md:text-4xl">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {(live || aside) && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {live}
          {aside}
        </div>
      )}
    </header>
  );
}

// Pastille « en direct » : à n'afficher que là où la page se rafraîchit réellement.
export function LiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      {label}
    </span>
  );
}
