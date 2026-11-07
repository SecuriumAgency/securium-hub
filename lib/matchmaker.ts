import { evaluateMatch, type MatchableArtisan, type MatchableLead, type MatchResult } from "@/lib/broker/matching";
import { calculateBatchDiscount, calculateSuggestedPrice, type LeadQuality } from "@/lib/broker/pricingEngine";
import { expandZones } from "@/lib/geo-adjacency";

// Matchmaker : vue inversée du Lead Broker. Pour chaque partenaire actif, les leads consentis et disponibles qui lui
// correspondent : même niche, et même zone ou département limitrophe d'une zone couverte. La règle stricte du Lead
// Broker reste inchangée ; les zones limitrophes sont un repli, signalé et noté plus bas. Déterministe, sans IA, sans
// accès à la base : les données sont lues par lib/matchmaker-server.ts. Module sans dépendance serveur, partagé avec le tableau de bord.

/** Nombre maximal de leads assignés d'un coup (limite de la vente par lot). */
export const MAX_ASSIGN = 200;
/** Leads montrés sur chaque carte, pour le pitch téléphonique. */
export const PREVIEW_SIZE = 5;
/** Score d'un lead situé dans un département limitrophe d'une zone couverte (la zone exacte vaut 100, le département 80). */
export const ADJACENT_SCORE = 60;

export type MatchmakerPartner = {
  id: string;
  company: string;
  city: string | null;
  partnershipType: string;
  isClient: boolean;
  targetNiches: string[];
  targetZipCodes: string[];
};

/** Lead vendable : disponible et consenti. Les champs sont ceux de CapturedLead, sans coordonnées de la personne. */
export type MatchmakerLead = {
  id: string;
  niche: string;
  region: string | null;
  postalCode: string | null;
  urgency: string | null;
  quality: LeadQuality;
  suggestedPrice: number | null;
  isExclusive: boolean;
};

export type MatchmakerPreview = {
  id: string;
  niche: string;
  region: string | null;
  postalCode: string | null;
  urgency: string | null;
  quality: LeadQuality;
  isExclusive: boolean;
  score: number;
  /** Vrai si le lead n'est compatible que par une zone limitrophe : à signaler au téléphone. */
  adjacent: boolean;
};

export type MatchmakerRow = {
  partner: MatchmakerPartner;
  /** CPA : transmission sans prix (0 €). CPL : vente au tarif suggéré, remise de lot comprise. */
  mode: "CPA" | "CPL";
  leadIds: string[];
  leadCount: number;
  /** Parmi leadCount, ceux qui ne sont compatibles que par une zone limitrophe. */
  adjacentCount: number;
  preview: MatchmakerPreview[];
  /** Montant facturé par l'assignation, en euros. Toujours 0 pour un partenaire CPA. */
  total: number;
  /** Vrai si l'assignation d'un coup est possible : au moins un lead, et au plus MAX_ASSIGN. */
  assignable: boolean;
};

/** Résultat du matching Matchmaker : le résultat du Lead Broker, plus le drapeau « zone limitrophe ». */
export type MatchmakerMatch = MatchResult & { adjacent: boolean };

/** Partenaire actif : au moins une niche et une zone. Même critère que le matching du Lead Broker. */
export function isActivePartner(partner: Pick<MatchmakerPartner, "targetNiches" | "targetZipCodes">): boolean {
  return partner.targetNiches.length > 0 && partner.targetZipCodes.length > 0;
}

/**
 * Matching du Matchmaker. D'abord la règle stricte du Lead Broker (niche, puis zone exacte ou département). À défaut,
 * les zones élargies de l'acheteur (ses zones et leurs départements limitrophes) : un lead y est compatible avec un
 * score de ADJACENT_SCORE et le drapeau `adjacent`. La niche reste obligatoire dans les deux cas.
 */
export function evaluateMatchmaker(lead: MatchableLead, partner: MatchableArtisan): MatchmakerMatch {
  const direct = evaluateMatch(lead, partner);
  if (direct.eligible) return { ...direct, adjacent: false };
  const widened = evaluateMatch(lead, { targetNiches: partner.targetNiches, targetZipCodes: expandZones(partner.targetZipCodes) });
  if (widened.eligible) return { eligible: true, score: ADJACENT_SCORE, label: "Match 60% · zone limitrophe", adjacent: true };
  return { ...direct, adjacent: false };
}

const QUALITY_RANK: Record<LeadQuality, number> = { FAIBLE: 1, MOYEN: 2, FORT: 3 };

/** Montant d'une assignation : 0 € en CPA, sinon le prix suggéré de chaque lead, remise de lot comprise. */
export function assignmentTotal(mode: "CPA" | "CPL", leads: MatchmakerLead[]): number {
  if (mode === "CPA") return 0;
  const suggestedSum = leads.reduce((sum, lead) => sum + (lead.suggestedPrice ?? calculateSuggestedPrice(lead.quality, lead.niche)), 0);
  return calculateBatchDiscount(leads.length, suggestedSum).total;
}

/**
 * Croise les partenaires actifs et les leads vendables. Renvoie une ligne par partenaire actif, triée par volume de
 * leads compatibles décroissant, puis par nom. Un lead compatible avec deux partenaires figure dans les deux lignes :
 * il n'est vendu qu'une fois, au premier assigné.
 */
export function buildMatchmaker(partners: MatchmakerPartner[], leads: MatchmakerLead[]): MatchmakerRow[] {
  const rows = partners.filter(isActivePartner).map((partner): MatchmakerRow => {
    const compatible: { lead: MatchmakerLead; score: number; adjacent: boolean }[] = [];
    for (const lead of leads) {
      const result = evaluateMatchmaker(lead, partner);
      if (result.eligible) compatible.push({ lead, score: result.score, adjacent: result.adjacent });
    }
    // Aperçu : les leads FORT d'abord, puis le meilleur score (une zone exacte passe avant une zone limitrophe).
    // L'ordre d'entrée (plus récents d'abord) départage.
    const ordered = [...compatible].sort((a, b) => QUALITY_RANK[b.lead.quality] - QUALITY_RANK[a.lead.quality] || b.score - a.score);
    const mode: "CPA" | "CPL" = partner.partnershipType === "CPA" ? "CPA" : "CPL";
    const count = compatible.length;
    return {
      partner: {
        id: partner.id,
        company: partner.company,
        city: partner.city,
        partnershipType: partner.partnershipType,
        isClient: partner.isClient,
        targetNiches: partner.targetNiches,
        targetZipCodes: partner.targetZipCodes,
      },
      mode,
      leadIds: compatible.map(({ lead }) => lead.id),
      leadCount: count,
      adjacentCount: compatible.filter((item) => item.adjacent).length,
      preview: ordered.slice(0, PREVIEW_SIZE).map(({ lead, score, adjacent }) => ({
        id: lead.id,
        niche: lead.niche,
        region: lead.region,
        postalCode: lead.postalCode,
        urgency: lead.urgency,
        quality: lead.quality,
        isExclusive: lead.isExclusive,
        score,
        adjacent,
      })),
      total: assignmentTotal(mode, compatible.map(({ lead }) => lead)),
      assignable: count >= 1 && count <= MAX_ASSIGN,
    };
  });

  return rows.sort((a, b) => b.leadCount - a.leadCount || a.partner.company.localeCompare(b.partner.company));
}
