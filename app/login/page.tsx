import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import { LoginForm } from "./LoginForm";

// Seule page du hub indexable (voir robots.ts et sitemap.ts) : elle porte son URL canonique et les données
// structurées de l'agence.
export const metadata: Metadata = {
  title: "Connexion au hub Securium · QG de l’agence",
  description:
    "Accès réservé à l’équipe Securium Agency : flotte de sites, leads et agents, depuis le centre de commandement 3D du hub.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05070d] px-4">
      <OrganizationJsonLd />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl"
      />
      <section className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <LockKeyhole aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">Securium Core</p>
            <h1 className="text-lg font-semibold text-white">Securium Hub</h1>
          </div>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
