import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Mail, Send, X } from "lucide-react";
import { DRAFT_STATUS } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";
import { markDraftSent, rejectDraft } from "./actions";

export const metadata: Metadata = {
  title: "Prospection · Securium Core",
};

// Lue à chaque visite, derrière la session admin (middleware.ts) : la table change à chaque import.
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;
// Heure de Paris imposée, comme le tableau des leads.
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short" });

// Statuts du registre de securium-prospector, et celui des brouillons du Chasseur. Les autres gardent un style neutre.
const statusStyle: Record<string, string> = {
  Envoye: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  Relance_1: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  [DRAFT_STATUS]: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};
const neutralStyle = "border-white/10 bg-white/5 text-slate-300";

// Prospects démarchés par e-mail (scripts/migrate-outreach.mts), et brouillons de l'agent Chasseur
// (scripts/agent-chasseur.mts) à valider : rien ne part sans un clic ici.
export default async function OutreachPage() {
  const [prospects, total, byStatus, drafts] = await Promise.all([
    prisma.outreachProspect.findMany({ orderBy: { lastContactAt: "desc" }, take: MAX_ROWS }),
    prisma.outreachProspect.count(),
    prisma.outreachProspect.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.outreachDraft.findMany({
      orderBy: { createdAt: "asc" },
      include: { prospect: { select: { company: true, email: true } } },
    }),
  ]);
  const statuses = byStatus.sort((a, b) => b._count._all - a._count._all);

  return (
    <main className="min-h-dvh bg-[#05070d] px-4 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Hub
          </Link>
          <span className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <Send aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">Securium Core</p>
            <h1 className="text-lg font-semibold text-white">Prospection</h1>
          </div>
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-white tabular-nums">{total}</span> prospect{total > 1 ? "s" : ""} démarché
            {total > 1 ? "s" : ""}
          </p>
        </header>

        {statuses.length > 0 && (
          <ul aria-label="Prospects par statut" className="flex flex-wrap gap-2">
            {statuses.map(({ status, _count }) => (
              <li key={status} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyle[status] ?? neutralStyle}`}>
                {status} · <span className="tabular-nums">{_count._all}</span>
              </li>
            ))}
          </ul>
        )}

        {drafts.length > 0 && (
          <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
            <div>
              <h2 id="drafts-title" className="text-sm font-semibold text-white">
                Brouillons à valider · <span className="tabular-nums">{drafts.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Rédigés par l&apos;agent Chasseur. Relisez, envoyez depuis votre messagerie, puis marquez l&apos;email comme
                envoyé : c&apos;est ce clic qui passe le prospect à « Envoye ».
              </p>
            </div>
            <ul className="grid gap-3 lg:grid-cols-2">
              {drafts.map((draft) => (
                <li key={draft.id} className="flex flex-col gap-3 rounded-xl border border-violet-400/20 bg-slate-950/40 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white" title={draft.prospect.company}>
                      {draft.prospect.company}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {draft.prospect.email} · avant : {draft.previousStatus} · rédigé le {dateFormat.format(draft.createdAt)} ({draft.model})
                    </p>
                  </div>
                  <p className="text-xs font-medium text-slate-200">{draft.subject}</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{draft.body}</p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <a
                      href={`mailto:${draft.prospect.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition-colors hover:border-white/20 focus-visible:outline-2 focus-visible:outline-cyan-400"
                    >
                      <Mail aria-hidden className="size-3.5" />
                      Ouvrir dans la messagerie
                    </a>
                    <form action={markDraftSent}>
                      <input type="hidden" name="draftId" value={draft.id} />
                      <button
                        type="submit"
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-400/20 focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        <Check aria-hidden className="size-3.5" />
                        Marquer comme envoyé
                      </button>
                    </form>
                    <form action={rejectDraft}>
                      <input type="hidden" name="draftId" value={draft.id} />
                      <button
                        type="submit"
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-400/20 focus-visible:outline-2 focus-visible:outline-rose-400"
                      >
                        <X aria-hidden className="size-3.5" />
                        Rejeter
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {total === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
            Aucun prospect importé. L&apos;historique s&apos;importe avec{" "}
            <span className="font-mono text-slate-300">node scripts/migrate-outreach.mts --send</span>.
          </p>
        ) : (
          <div className="overflow-auto rounded-xl border border-white/10 bg-slate-950/40">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <caption className="sr-only">Prospects démarchés, du dernier contact le plus récent au plus ancien</caption>
              <thead className="sticky top-0 border-b border-white/10 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  {["Premier contact", "Dernier contact", "Entreprise", "Email", "Téléphone", "Statut", "Source"].map((column) => (
                    <th key={column} scope="col" className="px-3 py-2.5 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {prospects.map((prospect) => (
                  <tr key={prospect.id} className="transition-colors hover:bg-white/[0.04]">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">{dateFormat.format(prospect.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-400">{dateFormat.format(prospect.lastContactAt)}</td>
                    <td className="max-w-56 truncate px-3 py-2 font-medium text-white" title={prospect.company}>
                      {prospect.company}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2" title={prospect.email}>
                      <a href={`mailto:${prospect.email}`} className="text-slate-300 transition-colors hover:text-cyan-300">
                        {prospect.email}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {prospect.phone ? (
                        <a href={`tel:${prospect.phone.replace(/[^\d+]/g, "")}`} className="text-slate-300 transition-colors hover:text-cyan-300">
                          {prospect.phone}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${statusStyle[prospect.status] ?? neutralStyle}`}>
                        {prospect.status}
                      </span>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2 text-slate-400" title={prospect.source}>
                      {prospect.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > MAX_ROWS && (
          <p className="text-xs text-slate-500">
            {MAX_ROWS} prospects affichés sur {total}, du contact le plus récent au plus ancien.
          </p>
        )}
      </div>
    </main>
  );
}
