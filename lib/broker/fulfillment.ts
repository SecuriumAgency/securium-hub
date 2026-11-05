// Livraison d'un lead acheté : coordonnées complètes envoyées à l'artisan après paiement.
// Stub : aucun e-mail ne part tant que le fournisseur d'envoi n'est pas branché. Ne jamais journaliser
// les coordonnées ici, seulement des identifiants.

export type FulfilledLead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  niche: string;
  region: string | null;
  postalCode: string | null;
  urgency: string | null;
  message: string | null;
  price: number | null;
};

export async function sendLeadFulfillmentEmail(artisanId: string, lead: FulfilledLead): Promise<void> {
  console.info(`[fulfillment] stub : livraison du lead ${lead.id} à l'artisan ${artisanId} non envoyée (fournisseur d'envoi à brancher).`);
}
