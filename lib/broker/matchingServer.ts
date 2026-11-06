import { canonicalNiche, evaluateMatchAll } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

// Recherche serveur des artisans compatibles avec un ensemble de leads disponibles à la vente.
// Un artisan n'est retourné que s'il est compatible avec TOUS les leads demandés.

export type EligibleArtisan = { id: string; company: string; city: string | null; score: number; label: string; partnershipType: string };

/** Leads disponibles et cessibles parmi ceux demandés. Renvoie aussi les identifiants absents ou non vendables. */
export async function loadSellableLeads(leadIds: string[]) {
  const leads = await prisma.capturedLead.findMany({
    where: { id: { in: leadIds }, status: "AVAILABLE", consentToShare: true },
    select: { id: true, niche: true, postalCode: true, region: true },
  });
  return leads;
}

export async function findEligibleArtisans(leadIds: string[]): Promise<EligibleArtisan[]> {
  const leads = await loadSellableLeads(leadIds);
  if (leads.length === 0 || leads.length !== new Set(leadIds).size) return [];

  // Présélection par niche canonique (« pac » et « pompe-a-chaleur » désignent la même niche), puis contrôle de zone et de tous les leads en mémoire.
  const niches = [...new Set(leads.map((lead) => canonicalNiche(lead.niche)).filter(Boolean))];
  const candidates = await prisma.outreachProspect.findMany({
    where: { targetNiches: { hasSome: niches } },
    select: { id: true, company: true, city: true, targetNiches: true, targetZipCodes: true, partnershipType: true },
    take: 500,
  });

  const eligible: EligibleArtisan[] = [];
  for (const artisan of candidates) {
    const result = evaluateMatchAll(leads, artisan);
    if (result.eligible) {
      eligible.push({ id: artisan.id, company: artisan.company, city: artisan.city, score: result.score, label: result.label, partnershipType: artisan.partnershipType });
    }
  }
  return eligible.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}
