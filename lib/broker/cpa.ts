import { BrokerError, exclusivityViolation } from "@/lib/broker/batch";
import { prisma } from "@/lib/prisma";

// Apporteur d'affaires (CPA) : le lead est transmis au partenaire, sans prix de vente, sans lot et sans paiement
// immédiat. La commission se suit ensuite, étape par étape. Seul un lead consenti (consentToShare) peut être transmis :
// c'est la règle du Lead Broker, qui vaut aussi pour les partenaires.

/** Transmet des leads à un partenaire CPA, en une seule transaction. Renvoie le nombre de leads transmis. */
export async function transmitToPartner(leadIds: string[], buyerId: string, now = new Date()): Promise<{ count: number }> {
  return prisma.$transaction(async (tx) => {
    const buyer = await tx.outreachProspect.findUnique({ where: { id: buyerId }, select: { id: true, partnershipType: true } });
    if (!buyer) throw new BrokerError("Partenaire introuvable.", 404);
    if (buyer.partnershipType !== "CPA") throw new BrokerError("Ce partenaire n'est pas en mode apporteur d'affaires (CPA).", 400);

    const ids = [...new Set(leadIds)];
    // Consentement obligatoire : un lead non consenti ne sort pas de la base vers un tiers.
    const leads = await tx.capturedLead.findMany({
      where: { id: { in: ids }, status: "AVAILABLE", consentToShare: true },
      select: { id: true, isExclusive: true, soldCount: true },
    });
    if (leads.length !== ids.length) {
      throw new BrokerError("Certains leads ne sont plus disponibles ou ne sont pas consentis : transmission refusée.", 409);
    }
    const exclusivity = exclusivityViolation(leads);
    if (exclusivity) throw exclusivity;

    for (const lead of leads) {
      const updated = await tx.capturedLead.updateMany({
        where: { id: lead.id, status: "AVAILABLE", consentToShare: true },
        data: { status: "SOLD", buyerId: buyer.id, price: null, soldAt: now, soldCount: { increment: 1 }, dealStatus: "TRANSMIS" },
      });
      if (updated.count !== 1) throw new BrokerError("Transmission interrompue : un lead a changé d'état.", 409);
    }
    return { count: leads.length };
  });
}
