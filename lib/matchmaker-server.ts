import { GEO_ENERGY_HABITAT } from "@/lib/broker/partners";
import { buildMatchmaker, type MatchmakerLead, type MatchmakerPartner, type MatchmakerRow } from "@/lib/matchmaker";
import { prisma } from "@/lib/prisma";

// Lecture du Matchmaker : deux requêtes, puis croisement par lib/matchmaker.ts. Les désinscrits ne reçoivent jamais de lead.
// Les leads sont lus sans limite : seuls les leads disponibles et consentis (consentToShare) entrent dans le croisement.

export type MatchmakerView = {
  rows: MatchmakerRow[];
  /** Identifiant du partenaire de l'onglet Focus, s'il figure dans le registre (actif ou non). */
  focusId: string | null;
  leadCount: number;
};

export async function loadMatchmaker(): Promise<MatchmakerView> {
  const [partnerRows, leadRows] = await Promise.all([
    prisma.outreachProspect.findMany({
      where: { status: { not: "Desinscrit" } },
      orderBy: { company: "asc" },
      select: { id: true, company: true, email: true, city: true, partnershipType: true, isClient: true, targetNiches: true, targetZipCodes: true },
    }),
    prisma.capturedLead.findMany({
      where: { status: "AVAILABLE", consentToShare: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, niche: true, region: true, postalCode: true, urgency: true, quality: true, suggestedPrice: true, isExclusive: true },
    }),
  ]);

  const partners: MatchmakerPartner[] = partnerRows.map((partner) => ({
    id: partner.id,
    company: partner.company,
    city: partner.city,
    partnershipType: partner.partnershipType,
    isClient: partner.isClient,
    targetNiches: partner.targetNiches,
    targetZipCodes: partner.targetZipCodes,
  }));
  const leads: MatchmakerLead[] = leadRows.map((lead) => ({
    id: lead.id,
    niche: lead.niche,
    region: lead.region,
    postalCode: lead.postalCode,
    urgency: lead.urgency,
    quality: lead.quality,
    suggestedPrice: lead.suggestedPrice,
    isExclusive: lead.isExclusive,
  }));

  const focusId = partnerRows.find((partner) => partner.email === GEO_ENERGY_HABITAT.email)?.id ?? null;

  return { rows: buildMatchmaker(partners, leads), focusId, leadCount: leads.length };
}
