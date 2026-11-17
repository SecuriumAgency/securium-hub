// Tableau de bord CPA : colonnes du Kanban et commissions estimées, selon l'étape de chaque lead.
// Module pur, sans accès à la base : utilisable côté navigateur et testable sans Prisma.
import type { DealStatus } from "@/lib/broker/cpa-constants";

export type KanbanColumnId = "TRANSMIS" | "DEVIS_EN_COURS" | "SIGNE" | "COMMISSION_PAYEE";

// Une colonne par étape d'avancement. « Signés » regroupe la signature et le chantier démarré : un chantier démarré
// est un contrat signé. Déposer une carte dans une colonne lui donne l'étape d'entrée (`entry`) de cette colonne.
export const KANBAN_COLUMNS: { id: KanbanColumnId; label: string; entry: DealStatus; stages: readonly DealStatus[] }[] = [
  { id: "TRANSMIS", label: "Envoyé", entry: "TRANSMIS", stages: ["TRANSMIS"] },
  { id: "DEVIS_EN_COURS", label: "En négo", entry: "DEVIS_EN_COURS", stages: ["DEVIS_EN_COURS"] },
  { id: "SIGNE", label: "Signés", entry: "SIGNE", stages: ["SIGNE", "CHANTIER_DEMARRE"] },
  { id: "COMMISSION_PAYEE", label: "Payés", entry: "COMMISSION_PAYEE", stages: ["COMMISSION_PAYEE"] },
];

// Latente : le lead est transmis ou en négociation, rien n'est signé. Sécurisée : signé, chantier démarré ou payé.
const LATENT_STAGES: readonly DealStatus[] = ["TRANSMIS", "DEVIS_EN_COURS"];
const SECURED_STAGES: readonly DealStatus[] = ["SIGNE", "CHANTIER_DEMARRE", "COMMISSION_PAYEE"];

// Un lead sans étape est un lead transmis : c'est l'étape de départ.
export function columnOf(status: DealStatus | null): KanbanColumnId {
  const stage = status ?? "TRANSMIS";
  return KANBAN_COLUMNS.find((column) => column.stages.includes(stage))?.id ?? "TRANSMIS";
}

export type CpaDeal = { dealStatus: DealStatus | null; expectedCommission: number | null };

export type CpaKpis = {
  latent: number;
  latentCount: number;
  secured: number;
  securedCount: number;
  // Leads sans commission estimée : ils ne comptent dans aucun total.
  unestimated: number;
};

export function commissionKpis(deals: readonly CpaDeal[]): CpaKpis {
  const kpis: CpaKpis = { latent: 0, latentCount: 0, secured: 0, securedCount: 0, unestimated: 0 };
  for (const deal of deals) {
    const stage = deal.dealStatus ?? "TRANSMIS";
    if (deal.expectedCommission === null) kpis.unestimated += 1;
    const amount = deal.expectedCommission ?? 0;
    if (LATENT_STAGES.includes(stage)) {
      kpis.latent += amount;
      kpis.latentCount += 1;
    } else if (SECURED_STAGES.includes(stage)) {
      kpis.secured += amount;
      kpis.securedCount += 1;
    }
  }
  return kpis;
}

const eurosFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function euros(value: number): string {
  return eurosFormat.format(value);
}
