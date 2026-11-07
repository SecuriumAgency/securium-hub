"use server";

import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { BrokerError, createLeadBatch } from "@/lib/broker/batch";
import { transmitToPartner } from "@/lib/broker/cpa";
import { evaluateMatch } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";
import { MAX_ASSIGN, isActivePartner } from "@/lib/matchmaker";

// Assignation depuis le Matchmaker. Deux chemins, déjà utilisés par le Lead Broker :
// - partenaire CPA : transmission sans prix (0 €), commission suivie ensuite dans Ventes ;
// - partenaire CPL : lot au tarif suggéré, remise de lot comprise, facturé comme une vente.
// Avant toute écriture, la compatibilité (niche et zone) est revérifiée côté serveur : la page peut être périmée.

// Identifiant cuid : rien d'autre n'atteint la base.
const ID = /^[a-z0-9]{1,40}$/;

export type AssignResult =
  | { ok: true; mode: "CPA" | "CPL"; count: number; total: number; billing: "manual" | "stripe_pending" | null }
  | { ok: false; error: string };

/** Assigne des leads compatibles à un partenaire. Renvoie le nombre de leads assignés et le montant facturé. */
export async function assignLeadsToPartner(buyerId: string, leadIds: string[]): Promise<AssignResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const parsed = z
    .object({ buyerId: z.string().regex(ID), leadIds: z.array(z.string().regex(ID)).min(1).max(MAX_ASSIGN) })
    .safeParse({ buyerId, leadIds });
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };
  const ids = [...new Set(parsed.data.leadIds)];

  try {
    const buyer = await prisma.outreachProspect.findUnique({
      where: { id: parsed.data.buyerId },
      select: { id: true, status: true, partnershipType: true, targetNiches: true, targetZipCodes: true },
    });
    if (!buyer || buyer.status === "Desinscrit") return { ok: false, error: "Partenaire introuvable." };
    if (!isActivePartner(buyer)) return { ok: false, error: "Partenaire inactif : aucune niche ou zone configurée." };

    const leads = await prisma.capturedLead.findMany({
      where: { id: { in: ids }, status: "AVAILABLE", consentToShare: true },
      select: { id: true, niche: true, region: true, postalCode: true },
    });
    if (leads.length !== ids.length) {
      return { ok: false, error: "Certains leads ne sont plus disponibles : actualisez la page." };
    }
    if (leads.some((lead) => !evaluateMatch(lead, buyer).eligible)) {
      return { ok: false, error: "Partenaire incompatible avec au moins un lead : actualisez la page." };
    }

    if (buyer.partnershipType === "CPA") {
      const result = await transmitToPartner(ids, buyer.id);
      return { ok: true, mode: "CPA", count: result.count, total: 0, billing: null };
    }
    const result = await createLeadBatch({ leadIds: ids, buyerId: buyer.id, mode: "batch" });
    return { ok: true, mode: "CPL", count: result.count, total: result.total, billing: result.billing };
  } catch (error) {
    if (error instanceof BrokerError) return { ok: false, error: error.message };
    console.error("[matchmaker] assignation impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return { ok: false, error: "Assignation impossible." };
  }
}
