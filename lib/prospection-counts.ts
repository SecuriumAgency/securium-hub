import { CONTACTED_STATUSES } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";

// Compteurs de la prospection : prospects hors clients, démarchés, relances en cours. Lus en base.
export type ProspectionCounts = {
  // Prospects en base, tous statuts confondus.
  prospects: number;
  // Prospects démarchés : statut Envoye ou Relance_1.
  contacted: number;
  // Relances en cours : statut Relance_1.
  followUps: number;
};

// Partagé par la page Batcave (rendu serveur) et par GET /api/prospection/stats (rafraîchissement).
export async function loadProspectionCounts(): Promise<ProspectionCounts> {
  const [prospects, contacted, followUps] = await Promise.all([
    prisma.outreachProspect.count({ where: { isClient: false } }),
    prisma.outreachProspect.count({ where: { isClient: false, status: { in: [...CONTACTED_STATUSES] } } }),
    prisma.outreachProspect.count({ where: { isClient: false, status: "Relance_1" } }),
  ]);
  return { prospects, contacted, followUps };
}
