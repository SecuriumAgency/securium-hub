import Stripe from "stripe";

// Client Stripe, créé à la demande : sans STRIPE_SECRET_KEY, aucun appel n'est fait et la route répond 503.
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}
