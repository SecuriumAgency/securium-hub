import Link from "next/link";
import { Bot, Factory, Monitor, Search, Target, type LucideIcon } from "lucide-react";

// Mêmes pages que la barre des pages admin (components/admin/AdminNav.tsx) : la vue 3D y renvoie déjà
// via « Hub 3D », ce composant ouvre le chemin inverse.
const PAGES: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/outreach", label: "Prospection", icon: Target },
  { href: "/admin/fleet", label: "Parc Sites", icon: Factory },
  { href: "/admin/agents", label: "Escadron Agents", icon: Bot },
  { href: "/admin/agents#poste", label: "Securium OS", icon: Monitor },
  { href: "/admin/seo", label: "Audit SEO", icon: Search },
];

export function HubNav() {
  return (
    <nav aria-label="Pages Securium Core" className="pointer-events-auto flex flex-wrap gap-2">
      {PAGES.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/40 px-3 text-xs font-medium text-slate-300 backdrop-blur-xl transition-colors hover:border-cyan-300/40 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
