import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Panel } from "@/components/admin/Panel";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rapports · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : un rapport peut arriver à tout moment.
export const dynamic = "force-dynamic";

const button =
  "inline-flex min-h-[44px] items-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary transition-all duration-300 hover:bg-primary/20 hover:glow-amber focus-visible:outline-2 focus-visible:outline-primary";
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

        <PageHeader
          title="Rapports quotidiens"
          description={
            <>
              <span className="font-semibold tabular-nums text-foreground">{reports.length}</span> rapport(s) du Chief Data Officer, avec
              l&apos;activité des agents de la journée
            </>
          }
        />

        <SectionTabs
          label="Sections des rapports"
          tabs={[
            {
              id: "visionneuse",
              label: "Visionneuse",
              content: selected ? (
                <Panel
                  id="visionneuse"
                  title={`Rapport du ${dayLabel(selected.date)}`}
                  action={
                    <a href={`/api/reports/${selected.date}?download=1`} className={button}>
                      Télécharger le PDF
                    </a>
                  }
                >
                  <iframe
                    src={`/api/reports/${selected.date}`}
                    title={`Rapport du ${dayLabel(selected.date)}`}
                    className="h-[75vh] w-full rounded-xl border border-border bg-background"
                  />
                </Panel>
              ) : (
                <Panel>
                  <p className="text-sm text-muted-foreground">Aucun rapport reçu pour l&apos;instant.</p>
                </Panel>
              ),
            },
            {
              id: "historique",
              label: "Historique",
              count: reports.length,
              content: (
                <Panel id="historique" title="Tous les rapports" description="Du plus récent au plus ancien.">
                  {reports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun rapport reçu pour l&apos;instant.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {reports.map((report) => (
                        <li key={report.date} className="flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40">
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
                  )}
                </Panel>
              ),
            },
          ]}
          initialId={jour ? "visionneuse" : undefined}
        />
      </div>
    </main>
  );
}
