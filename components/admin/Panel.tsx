import type { ReactNode } from "react";

// Carte commune des pages admin : titre, description optionnelle, actions à droite. Au survol, halo ambre.
export function Panel({
  id,
  title,
  description,
  action,
  children,
  className = "",
}: {
  id?: string;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? id : undefined}
      className={`glass-panel flex flex-col gap-4 rounded-2xl p-4 transition-shadow duration-300 hover:glow-amber md:p-6 ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && (
              <h2 id={id} className="text-base font-semibold text-foreground">
                {title}
              </h2>
            )}
            {description && <div className="text-sm text-muted-foreground">{description}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
