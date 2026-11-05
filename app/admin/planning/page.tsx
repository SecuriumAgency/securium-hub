import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { LiveRefresh } from "@/components/admin/LiveRefresh";
import { Panel } from "@/components/admin/Panel";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionTabs } from "@/components/admin/SectionTabs";
import type { FelixAlert, PlanningSnapshot } from "@/lib/telemetry";
import { readStoredReport, type StoredReport } from "@/lib/telemetry-store";

export const metadata: Metadata = {
  title: "Planning · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : le poste envoie son planning toutes les 10 s.
export const dynamic = "force-dynamic";

// Au-delà de ce délai sans nouvelle du poste, le planning affiché est périmé.
const STALE_MS = 5 * 60_000;
const dayFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const updatedFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

const SEVERITY: Record<FelixAlert["severity"], { label: string; className: string }> = {
  critical: { label: "Critique", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  warn: { label: "Alerte", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  info: { label: "Info", className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
};

const duree = (valeur: number) => `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min`;
const dollars = (valeur: number) => `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} $`;
const jourCourt = (jour: string) => dayFormat.format(new Date(`${jour}T12:00:00+01:00`));
const quand = (iso: string) => `${dayFormat.format(new Date(iso))} · ${timeFormat.format(new Date(iso))}`;

// Planning du poste : qui travaille quand, combien de temps sur le moteur, budget du jour, alertes Felix Fix.
export default async function PlanningPage() {
  let stored: StoredReport | null = null;
  try {
    stored = await readStoredReport();
  } catch {
    stored = null;
  }
  const planning: PlanningSnapshot | null = stored?.report.planning ?? null;
  const alerts = [...(stored?.report.felix ?? [])].reverse();
  const stale = !stored || Date.now() - Date.parse(stored.receivedAt) > STALE_MS;

  const days = planning?.days ?? [];
  const names = [...new Set(days.flatMap((day) => day.agents.map((agent) => agent.name)))];
  const cellule = (jour: PlanningSnapshot["days"][number], name: string) => jour.agents.find((agent) => agent.name === name);
  const totaux = names
    .map((name) => ({
      name,
      minutes: days.reduce((somme, jour) => somme + (cellule(jour, name)?.minutes ?? 0), 0),
      costUsd: days.reduce((somme, jour) => somme + (cellule(jour, name)?.costUsd ?? 0), 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const depense = planning?.spentTodayUsd ?? 0;
  const plafond = planning?.dailyBudgetUsd ?? 0;
  const part = plafond > 0 ? Math.min(100, (depense / plafond) * 100) : 0;

  return (
    <main className="admin-shell min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6">
        <AdminNav />

        <PageHeader
          title="Planning des agents"
          description="Qui travaille, quand, et combien de temps sur le moteur IA."
          live={<LiveRefresh seconds={30} />}
        />

        {stale && (
          <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
            {stored
              ? `Dernier planning reçu le ${updatedFormat.format(new Date(stored.receivedAt))} : le poste ne répond plus.`
              : "Aucun planning reçu : le poste envoie-t-il encore sa télémétrie ?"}
          </p>
        )}

        <SectionTabs
          label="Sections du planning"
          tabs={[
            {
              id: "aujourdhui",
              label: "Aujourd'hui",
              content: (
                <div className="grid gap-6 md:grid-cols-2">
                  <Panel id="budget" title="Budget du jour">
                    <div
                      role="progressbar"
                      aria-label="Budget du jour utilisé"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(part)}
                      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                    >
                      <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${part}%` }} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Aujourd&apos;hui : <span className="font-semibold text-foreground">{dollars(depense)}</span> sur {dollars(plafond)} par jour.
                      Au plafond, une semaine coûte au plus {dollars(plafond * 7)}.
                    </p>
                  </Panel>

                  <Panel id="prochains" title="Prochains passages">
                    {planning && planning.nextRuns.length > 0 ? (
                      <ol className="flex flex-col divide-y divide-border">
                        {planning.nextRuns.map((run) => (
                          <li key={run.at} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                            <span className="font-medium text-foreground">{run.agent}</span>
                            <span className="tabular-nums text-muted-foreground">{quand(run.at)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucun passage prévu.</p>
                    )}
                  </Panel>
                </div>
              ),
            },
            {
              id: "semaine",
              label: "Semaine",
              content: (
                <Panel id="semaine" title="Temps passé sur le moteur, sept derniers jours">
                  {names.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune action enregistrée sur les sept derniers jours.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                            <th scope="col" className="py-2 pr-3 font-medium">
                              Agent
                            </th>
                            {days.map((jour) => (
                              <th key={jour.day} scope="col" className="py-2 pr-3 font-medium">
                                {jourCourt(jour.day)}
                              </th>
                            ))}
                            <th scope="col" className="py-2 font-medium">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {totaux.map((total) => (
                            <tr key={total.name} className="transition-colors hover:bg-muted/60">
                              <th scope="row" className="py-2 pr-3 font-medium text-foreground">
                                {total.name}
                              </th>
                              {days.map((jour) => {
                                const entree = cellule(jour, total.name);
                                return (
                                  <td key={jour.day} className="py-2 pr-3 tabular-nums text-muted-foreground">
                                    {entree ? `${duree(entree.minutes)} · ${entree.actions} action(s)` : "—"}
                                  </td>
                                );
                              })}
                              <td className="py-2 tabular-nums font-semibold text-foreground">
                                {duree(total.minutes)} · {dollars(total.costUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              ),
            },
            {
              id: "alertes",
              label: "Alertes Felix",
              count: alerts.length,
              content: (
                <Panel id="felix" title="Felix Fix : alertes" description="Felix Fix surveille l'écosystème toutes les cinq minutes.">
                  {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune alerte pour l&apos;instant.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {alerts.map((alerte) => (
                        <li key={`${alerte.at}-${alerte.key}`} className="flex flex-col gap-1 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className={`rounded-md border px-2 py-0.5 font-semibold ${SEVERITY[alerte.severity].className}`}>
                              {SEVERITY[alerte.severity].label}
                            </span>
                            <span className="tabular-nums">{updatedFormat.format(new Date(alerte.at))}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{alerte.title}</p>
                          <p className="text-xs text-muted-foreground">{alerte.detail}</p>
                          <p className="text-xs text-muted-foreground">
                            {alerte.repair ? `Réparation : ${alerte.repair}` : "Aucune réparation automatique : à traiter."}
                          </p>
                          {alerte.diagnosis && <p className="text-xs text-foreground/80">Diagnostic : {alerte.diagnosis}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
