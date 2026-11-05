import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { sendLeadFulfillmentEmail } from "@/lib/broker/fulfillment";
import { stripeClient } from "@/lib/broker/stripe";
import { prisma } from "@/lib/prisma";

// Webhook Stripe : livraison d'un lead après paiement. Route publique (appelée par Stripe), protégée
// par la signature du webhook : sans signature valide, rien n'est lu ni écrit.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });

  // Corps brut : la signature porte sur les octets exacts reçus.
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") return NextResponse.json({ received: true });

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return NextResponse.json({ received: true });

  const leadId = session.metadata?.leadId;
  const artisanId = session.metadata?.artisanId;
  if (!leadId || !artisanId) {
    console.error("[webhook] métadonnées absentes de la session", session.id);
    return NextResponse.json({ received: true });
  }

  try {
    // Passage à SOLD une seule fois : une relivraison Stripe ne refait rien (updateMany renvoie 0).
    const sold = await prisma.capturedLead.updateMany({
      where: { id: leadId, status: "AVAILABLE", consentToShare: true },
      data: { status: "SOLD", buyerId: artisanId, soldAt: new Date(), stripeSessionId: session.id },
    });
    if (sold.count === 1) {
      const lead = await prisma.capturedLead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          niche: true,
          region: true,
          postalCode: true,
          urgency: true,
          message: true,
          price: true,
        },
      });
      if (lead) await sendLeadFulfillmentEmail(artisanId, lead);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook] traitement impossible :", error instanceof Error ? error.message : "erreur inconnue");
    // 500 : Stripe renverra l'événement plus tard.
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
