import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rapports · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : un rapport peut arriver à tout moment.
export const dynamic = "force-dynamic";

const glass = "rounded-2xl border border-white/10 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-md md:p-6";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

// Rapports reçus du Chief Data Officer (POST /api/reports/upload), les plus récents d'abord.
export default async function ReportsPage() {
  const reports = await prisma.dailyReport.findMany({
    orderBy: { date: "desc" },
    take: 60,
    select: { date: true, sizeBytes: true, receivedAt: true },
  });

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground md:text-4xl">Rapports quotidiens</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{reports.length}</span> rapport(s) du Chief Data Officer
          </p>
        </header>

        <section aria-labelledby="reports-list" className={`${glass} flex flex-col gap-4`}>
          <h2 id="reports-list" className="sr-only">
            Liste des rapports
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rapport reçu pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/10">
              {reports.map((report) => (
                <li key={report.date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-base font-medium text-foreground">{report.date.split("-").reverse().join("/")}</p>
                    <p className="text-xs text-muted-foreground">
                      Reçu le {dateFormat.format(report.receivedAt)} · {Math.round(report.sizeBytes / 1024)} Ko
                    </p>
                  </div>
                  <a
                    href={`/api/reports/${report.date}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Ouvrir le PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
