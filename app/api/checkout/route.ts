import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { calculateSuggestedPrice } from "@/lib/broker/pricingEngine";
import { stripeClient } from "@/lib/broker/stripe";
import { prisma } from "@/lib/prisma";

// Session Stripe Checkout pour un lead : prix suggéré, identifiants du lead et de l'artisan dans les métadonnées.
// Réservé à la session admin (middleware) : c'est l'administrateur qui envoie le lien à l'artisan.
export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  leadId: z.string().min(1).max(64),
  artisanId: z.string().min(1).max(64),
});

const PUBLIC_URL = process.env.PUBLIC_APP_URL?.trim() || "https://hub.securium-agency.fr";

export async function POST(request: NextRequest) {
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Paiement non configuré (STRIPE_SECRET_KEY)." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 422 });
  const { leadId, artisanId } = parsed.data;

  try {
    const lead = await prisma.capturedLead.findFirst({
      where: { id: leadId, status: "AVAILABLE", consentToShare: true },
      select: { id: true, niche: true, region: true, quality: true, suggestedPrice: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead indisponible à la vente." }, { status: 409 });

    const artisan = await prisma.outreachProspect.findUnique({ where: { id: artisanId }, select: { id: true } });
    if (!artisan) return NextResponse.json({ error: "Artisan introuvable." }, { status: 404 });

    // Prix suggéré du lead, en centimes pour Stripe.
    const price = lead.suggestedPrice ?? calculateSuggestedPrice(lead.quality, lead.niche);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      client_reference_id: lead.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: Math.round(price * 100),
            product_data: { name: `Lead ${lead.niche.replace(/-/g, " ")}${lead.region ? ` · ${lead.region}` : ""}` },
          },
        },
      ],
      metadata: { leadId: lead.id, artisanId: artisan.id },
      success_url: `${PUBLIC_URL}/admin/broker?paiement=ok`,
      cancel_url: `${PUBLIC_URL}/admin/broker?paiement=annule`,
    });

    if (!session.url) return NextResponse.json({ error: "Session de paiement sans adresse." }, { status: 502 });

    // Trace du paiement en cours : le webhook retrouve le lead par ses métadonnées et cette session.
    await prisma.capturedLead.updateMany({
      where: { id: lead.id, status: "AVAILABLE" },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id }, { status: 201 });
  } catch (error) {
    console.error("[checkout] session impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Création de la session impossible." }, { status: 500 });
  }
}
