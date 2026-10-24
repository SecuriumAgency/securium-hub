"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Send, X } from "lucide-react";

const LINKS = [
  { href: "/", label: "Hub 3D" },
  { href: "/admin/outreach", label: "Prospection" },
];

const linkClass = (active: boolean) =>
  `flex min-h-[44px] min-w-[44px] items-center rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

// Navigation des pages admin : tiroir à droite sur mobile (bouton burger), barre étendue à partir de md.
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Tiroir ouvert : focus sur la fermeture, Échap ferme, la page derrière ne défile plus.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <nav aria-label="Administration" className="flex items-center justify-between gap-3">
      <Link href="/admin/outreach" className="flex min-h-[44px] min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Send aria-hidden className="size-4" />
        </span>
        <span className="truncate text-xs font-semibold uppercase tracking-[0.25em] text-primary">Securium Core</span>
      </Link>

      <ul className="hidden md:flex md:items-center md:gap-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={linkClass(pathname === link.href)}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="admin-drawer"
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-border bg-muted text-foreground focus-visible:outline-2 focus-visible:outline-primary md:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Ouvrir le menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div aria-hidden className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4"
          >
            <button
              ref={closeButton}
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center self-end rounded-lg border border-border bg-muted text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X aria-hidden className="size-5" />
              <span className="sr-only">Fermer le menu</span>
            </button>
            <ul className="flex flex-col gap-1">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className={linkClass(pathname === link.href)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}
