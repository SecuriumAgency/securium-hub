"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Box, Clapperboard, ExternalLink, FileText, FlaskConical, Factory, Layers, Menu, Monitor, Search, Target, X, type LucideIcon } from "lucide-react";
import { useOverlay } from "./use-overlay";

// Une entrée sans `href` n'a pas encore de page : elle s'affiche avec la mention « Bientôt », sans lien.
type NavItem = { label: string; icon: LucideIcon; href?: string; external?: boolean };

// Onglets de l'écosystème, dans l'ordre : la prospection d'abord, c'est la vue de travail. Les liens externes
// ouvrent un nouvel onglet.
const LINKS: NavItem[] = [
  { href: "/admin/outreach", label: "Prospection", icon: Target },
  { href: "/admin/fleet", label: "Parc Sites", icon: Factory },
  { href: "/admin/agents", label: "Escadron Agents", icon: Bot },
  { href: "/admin/seo", label: "Audit SEO", icon: Search },
  { href: "/admin/reports", label: "Rapports", icon: FileText },
  { href: "/admin/reels", label: "Reels Studio", icon: Clapperboard },
  { href: "/admin/ecosystem", label: "Écosystème", icon: Layers },
  { href: "https://www.securium-labs.app", label: "Labs", icon: FlaskConical, external: true },
  // Les agents du poste sont regroupés sur la page des agents : l'ancre mène directement à ce groupe.
  { href: "/admin/agents#poste", label: "Securium OS", icon: Monitor },
  { href: "/", label: "Hub 3D", icon: Box },
  { href: "https://www.securium-agency.fr", label: "Vitrine", icon: ExternalLink, external: true },
];

const linkClass = (active: boolean) =>
  `flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

function NavEntry({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (!item.href) {
    return (
      <span className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground">
        <Icon aria-hidden className="size-4 shrink-0" />
        {item.label}
        <span className="rounded-md border border-border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider">Bientôt</span>
      </span>
    );
  }
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={linkClass(active)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {item.label}
      {item.external && <ExternalLink aria-hidden className="size-3.5" />}
    </Link>
  );
}

// Navigation des pages admin : tiroir à droite sous lg (bouton burger). Au-delà, les entrées passent à la
// ligne si la largeur manque : huit entrées ne tiennent pas toujours sur une seule ligne.
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOverlay(open, close, closeButton);

  return (
    <nav aria-label="Administration" className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/admin/outreach" className="flex min-h-[44px] min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
        <Image
          src="/logo/securium-logo.png"
          alt=""
          width={36}
          height={36}
          priority
          className="size-9 shrink-0 rounded-xl border border-primary/20 bg-card object-contain p-1"
        />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.25em] text-primary">Securium Core</span>
      </Link>

      <ul className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-end lg:gap-1">
        {LINKS.map((item) => (
          <li key={item.label}>
            <NavEntry item={item} pathname={pathname} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="admin-drawer"
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-border bg-muted text-foreground focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Ouvrir le menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
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
              {LINKS.map((item) => (
                <li key={item.label}>
                  <NavEntry item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}
