import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Vente de leads capturés à un artisan, à l'unité ou par lot. Déterministe : aucun appel à un modèle.
// Une donnée n'est vendue que si la personne a accepté la cession (consentToShare) et qu'elle est AVAILABLE.

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

export type BatchResult = { batchId: string; count: number; total: number; billing: "manual" | "stripe_pending" };

/**
 * Crée le lot et marque les leads SOLD dans une seule transaction : si un lead a changé d'état entre-temps,
 * rien n'est écrit. Le mode « unit » applique le prix unitaire à chaque lead ; « batch » un prix global.
 */
export async function createLeadBatch(input: CreateBatchInput, now = new Date()): Promise<BatchResult> {
  const ids = [...new Set(input.leadIds)];
  if (input.mode === "unit" && input.unitPrice === undefined) throw new BrokerError("Prix unitaire requis.", 422);
  if (input.mode === "batch" && input.totalPrice === undefined) throw new BrokerError("Prix du lot requis.", 422);

  const result = await prisma.$transaction(async (tx) => {
    const buyer = await tx.outreachProspect.findUnique({ where: { id: input.buyerId }, select: { id: true, company: true } });
    if (!buyer) throw new BrokerError("Acheteur introuvable.", 404);

    const eligible = { id: { in: ids }, status: "AVAILABLE" as const, consentToShare: true };
    const found = await tx.capturedLead.count({ where: eligible });
    if (found !== ids.length) throw new BrokerError("Certains leads ne sont plus disponibles ou ne peuvent pas être cédés.", 409);

    const count = ids.length;
    const total = cents(input.mode === "unit" ? (input.unitPrice ?? 0) * count : (input.totalPrice ?? 0));
    const perLead = cents(total / count);

    const batch = await tx.leadBatch.create({
      data: {
        name: `${buyer.company} · ${count} lead${count > 1 ? "s" : ""} · ${now.toISOString().slice(0, 10)}`,
        totalPrice: total,
        buyerId: buyer.id,
        status: "PENDING_PAYMENT",
      },
      select: { id: true },
    });

    const updated = await tx.capturedLead.updateMany({
      where: eligible,
      data: { status: "SOLD", buyerId: buyer.id, batchId: batch.id, price: perLead, soldAt: now },
    });
    if (updated.count !== count) throw new BrokerError("Vente interrompue : un lead a changé d'état.", 409);

    return { batchId: batch.id, count, total };
  });

  // Facturation : manuelle tant que Stripe n'est pas branché. Le lien de paiement viendra ici.
  return { ...result, billing: process.env.STRIPE_SECRET_KEY ? "stripe_pending" : "manual" };
}
