import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { CommandCenter } from "@/components/admin/CommandCenter";
import { CONTACTED_STATUSES } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Batcave · Securium Core",
};

// Lu à chaque visite, derrière la session admin (middleware.ts) : les chiffres changent à chaque import.
export const dynamic = "force-dynamic";

// Centre de commandement : état des agents et serveurs (télémétrie côté client), prospection (base),
// raccourcis et workboard du jour.
export default async function CommandPage() {
  const [prospects, contacted, followUps] = await Promise.all([
    prisma.outreachProspect.count({ where: { isClient: false } }),
    prisma.outreachProspect.count({ where: { isClient: false, status: { in: [...CONTACTED_STATUSES] } } }),
    prisma.outreachProspect.count({ where: { isClient: false, status: "Relance_1" } }),
  ]);

  return (
    <main className="admin-shell batcave-backdrop min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Centre de commandement</p>
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Batcave</h1>
          <p className="text-sm text-muted-foreground">Les agents, les serveurs et la journée, en un coup d&apos;œil.</p>
        </header>

        <CommandCenter summary={{ prospects, contacted, followUps }} />
      </div>
    </main>
  );
}
