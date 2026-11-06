import { z } from "zod";
import { evaluateMatch } from "@/lib/broker/matching";
import { calculateBatchDiscount, calculateSuggestedPrice, type LeadQuality } from "@/lib/broker/pricingEngine";
import { prisma } from "@/lib/prisma";

// Vente de leads capturés à un artisan, à l'unité ou par lot. Déterministe : aucun appel à un modèle.
// Une donnée n'est vendue que si la personne a accepté la cession (consentToShare) et qu'elle est AVAILABLE.
// Sans prix saisi, le prix suggéré du moteur de pricing s'applique ; la réduction de lot (10 % dès 10 leads) aussi.

export const CreateBatchSchema = z.object({
  leadIds: z.array(z.string().min(1).max(64)).min(1).max(200),
  buyerId: z.string().min(1).max(64),
  mode: z.enum(["unit", "batch"]),
  unitPrice: z.number().positive().max(10_000).optional(),
  totalPrice: z.number().positive().max(1_000_000).optional(),
});
export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;

export class BrokerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Qualification et exclusivité : un lead exclusif ne se vend qu'une fois. Renvoie l'erreur à lever, ou null.
 * Un lead mutualisé reste vendable tant que soldCount n'a pas atteint maxSales (la revente multiple est à venir).
 */
export function exclusivityViolation(leads: { isExclusive: boolean; soldCount: number }[]): BrokerError | null {
  return leads.some((lead) => lead.isExclusive && lead.soldCount >= 1) ? new BrokerError("Ce lead exclusif a déjà été vendu.", 409) : null;
}

export type BatchResult = { batchId: string; count: number; total: number; billing: "manual" | "stripe_pending" };

/**
 * Crée le lot et marque les leads SOLD dans une seule transaction : si un lead a changé d'état entre-temps,
 * rien n'est écrit. Prix retenu :
 * - à l'unité : le prix saisi pour chaque lead, sinon le prix suggéré remisé du lot ;
 * - par lot : le prix global saisi, sinon le total suggéré remisé.
 */
export async function createLeadBatch(input: CreateBatchInput, now = new Date()): Promise<BatchResult> {
  const ids = [...new Set(input.leadIds)];

  const result = await prisma.$transaction(async (tx) => {
    const buyer = await tx.outreachProspect.findUnique({
      where: { id: input.buyerId },
      select: { id: true, company: true, targetNiches: true, targetZipCodes: true },
    });
    if (!buyer) throw new BrokerError("Acheteur introuvable.", 404);

    const eligible = { id: { in: ids }, status: "AVAILABLE" as const, consentToShare: true };
    const leads = await tx.capturedLead.findMany({
      where: eligible,
      select: { id: true, quality: true, niche: true, region: true, postalCode: true, suggestedPrice: true, isExclusive: true, soldCount: true },
    });

    // Anti-erreur : l'artisan doit être compatible (niche et zone) avec chacun des leads du lot.
    const incompatible = leads.filter((lead) => !evaluateMatch(lead, buyer).eligible);
    if (incompatible.length > 0) {
      throw new BrokerError(`Artisan non compatible avec ${incompatible.length} lead(s) du lot : niche ou zone non couverte.`, 400);
    }
    if (leads.length !== ids.length) throw new BrokerError("Certains leads ne sont plus disponibles ou ne peuvent pas être cédés.", 409);
    const exclusivity = exclusivityViolation(leads);
    if (exclusivity) throw exclusivity;

    const count = ids.length;
    const suggestedOf = (lead: { quality: LeadQuality; niche: string; suggestedPrice: number | null }) =>
      lead.suggestedPrice ?? calculateSuggestedPrice(lead.quality, lead.niche);
    const suggestedSum = leads.reduce((sum, lead) => sum + suggestedOf(lead), 0);
    const discountRate = calculateBatchDiscount(count, 100).rate;

    // Prix par lead et total retenus.
    const perLead = new Map<string, number>();
    let total: number;
    if (input.mode === "unit") {
      for (const lead of leads) {
        perLead.set(lead.id, input.unitPrice !== undefined ? cents(input.unitPrice) : cents(suggestedOf(lead) * (1 - discountRate)));
      }
      total = cents([...perLead.values()].reduce((sum, value) => sum + value, 0));
    } else {
      total = input.totalPrice !== undefined ? cents(input.totalPrice) : calculateBatchDiscount(count, suggestedSum).total;
      for (const lead of leads) perLead.set(lead.id, cents(total / count));
    }

    const batch = await tx.leadBatch.create({
      data: {
        name: `${buyer.company} · ${count} lead${count > 1 ? "s" : ""} · ${now.toISOString().slice(0, 10)}`,
        totalPrice: total,
        buyerId: buyer.id,
        status: "PENDING_PAYMENT",
      },
      select: { id: true },
    });

    for (const lead of leads) {
      const updated = await tx.capturedLead.updateMany({
        where: { id: lead.id, status: "AVAILABLE", consentToShare: true },
        data: { status: "SOLD", soldCount: { increment: 1 }, buyerId: buyer.id, batchId: batch.id, price: perLead.get(lead.id) ?? null, soldAt: now },
      });
      if (updated.count !== 1) throw new BrokerError("Vente interrompue : un lead a changé d'état.", 409);
    }

    return { batchId: batch.id, count, total };
  });

  // Facturation : manuelle tant que Stripe n'est pas branché. Le lien de paiement viendra ici.
  return { ...result, billing: process.env.STRIPE_SECRET_KEY ? "stripe_pending" : "manual" };
}
