"use server";

import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { BrokerError } from "@/lib/broker/batch";
import { DEAL_STATUSES, PARTNERSHIP_TYPES } from "@/lib/broker/cpa-constants";
import { transmitToPartner } from "@/lib/broker/cpa";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const ID = /^[a-z0-9]{1,40}$/;

export type CpaResult = { ok: true; count?: number } | { ok: false; error: string };

/** Transmet des leads consentis à un partenaire en mode CPA. Aucun prix, aucun lot, aucun appel à Stripe. */
export async function transmitLeadsToPartner(leadIds: string[], buyerId: string): Promise<CpaResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const parsed = z
    .object({ leadIds: z.array(z.string().regex(ID)).min(1).max(200), buyerId: z.string().regex(ID) })
    .safeParse({ leadIds, buyerId });
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };

  try {
    const result = await transmitToPartner(parsed.data.leadIds, parsed.data.buyerId);
    return { ok: true, count: result.count };
  } catch (error) {
    if (error instanceof BrokerError) return { ok: false, error: error.message };
    console.error("[cpa] transmission impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return { ok: false, error: "Transmission impossible." };
  }
}

/** Passe un partenaire en mode CPL (achat immédiat) ou CPA (apporteur d'affaires). */
export async function setPartnershipType(buyerId: string, type: string): Promise<CpaResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const parsed = z.object({ buyerId: z.string().regex(ID), type: z.enum(PARTNERSHIP_TYPES) }).safeParse({ buyerId, type });
  if (!parsed.success) return { ok: false, error: "Mode invalide." };
  try {
    await prisma.outreachProspect.update({ where: { id: parsed.data.buyerId }, data: { partnershipType: parsed.data.type } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Enregistrement impossible." };
  }
}

/** Étape du suivi d'un lead transmis. Refusé pour un lead qui n'a pas été transmis à un partenaire CPA. */
export async function setDealStatus(leadId: string, status: string): Promise<CpaResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const parsed = z.object({ leadId: z.string().regex(ID), status: z.enum(DEAL_STATUSES) }).safeParse({ leadId, status });
  if (!parsed.success) return { ok: false, error: "Étape invalide." };
  try {
    const updated = await prisma.capturedLead.updateMany({
      where: { id: parsed.data.leadId, dealStatus: { not: null } },
      data: { dealStatus: parsed.data.status },
    });
    return updated.count === 1 ? { ok: true } : { ok: false, error: "Ce lead n'est pas suivi en CPA." };
  } catch (error) {
    console.error("[cpa] étape impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return { ok: false, error: "Enregistrement impossible." };
  }
}

/** Commission estimée pour un lead CPA, en euros. Vide pour l'effacer. */
export async function setExpectedCommission(leadId: string, amount: number | null): Promise<CpaResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const parsed = z
    .object({ leadId: z.string().regex(ID), amount: z.number().min(0).max(1_000_000).nullable() })
    .safeParse({ leadId, amount });
  if (!parsed.success) return { ok: false, error: "Montant invalide." };
  try {
    const updated = await prisma.capturedLead.updateMany({
      where: { id: parsed.data.leadId, dealStatus: { not: null } },
      data: { expectedCommission: parsed.data.amount },
    });
    return updated.count === 1 ? { ok: true } : { ok: false, error: "Ce lead n'est pas suivi en CPA." };
  } catch (error) {
    console.error("[cpa] commission impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return { ok: false, error: "Enregistrement impossible." };
  }
}
