import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rapports · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : un rapport peut arriver à tout moment.
export const dynamic = "force-dynamic";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const button =
  "inline-flex min-h-[44px] items-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

const dayLabel = (date: string) => date.split("-").reverse().join("/");

// Rapports reçus du Chief Data Officer (POST /api/reports/upload), les plus récents d'abord. Le rapport
// demandé (?jour=AAAA-MM-JJ) s'affiche dans la visionneuse ; à défaut, le plus récent.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const { jour } = await searchParams;
  const reports = await prisma.dailyReport.findMany({
    orderBy: { date: "desc" },
    take: 60,
    select: { date: true, sizeBytes: true, receivedAt: true },
  });
  const selected = reports.find((report) => report.date === jour) ?? reports[0] ?? null;

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Rapports quotidiens</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{reports.length}</span> rapport(s) du Chief Data Officer, avec l&apos;activité des agents de la journée
          </p>
        </header>

        {selected ? (
          <section aria-labelledby="visionneuse" className={`${glass} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="visionneuse" className="text-base font-semibold text-foreground">
                Rapport du {dayLabel(selected.date)}
              </h2>
              <a href={`/api/reports/${selected.date}?download=1`} className={button}>
                Télécharger le PDF
              </a>
            </div>
            <iframe
              src={`/api/reports/${selected.date}`}
              title={`Rapport du ${dayLabel(selected.date)}`}
              className="h-[75vh] w-full rounded-xl border border-white/10 bg-background"
            />
          </section>
        ) : (
          <section className={glass}>
            <p className="text-sm text-muted-foreground">Aucun rapport reçu pour l&apos;instant.</p>
          </section>
        )}

        <section aria-labelledby="historique" className={`${glass} flex flex-col gap-4`}>
          <h2 id="historique" className="text-sm font-semibold uppercase tracking-wider text-primary">
            Historique
          </h2>
          <ul className="flex flex-col divide-y divide-white/10">
            {reports.map((report) => (
              <li key={report.date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-base font-medium text-foreground">{dayLabel(report.date)}</p>
                  <p className="text-xs text-muted-foreground">
                    Reçu le {dateFormat.format(report.receivedAt)} · {Math.round(report.sizeBytes / 1024)} Ko
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/reports?jour=${report.date}`} className={button}>
                    Voir
                  </Link>
                  <a href={`/api/reports/${report.date}?download=1`} className={button}>
                    Télécharger
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
