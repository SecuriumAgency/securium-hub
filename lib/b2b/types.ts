// Demandes de contact B2B : types partagés entre la route (serveur) et le store (navigateur). Aucune donnée ici.

// « À auditer » tant que l'audit n'a pas été réalisé.
export type B2BStatus = "À auditer" | "En audit" | "Audité";

export type B2BProspect = {
  id: string;
  name: string;
  company: string;
  service: string;
  // Horodatage ISO avec son fuseau.
  receivedAt: string;
  status: B2BStatus;
};

// Réponse de GET /api/b2b/prospects.
export type B2BProspectsResponse = {
  prospects: B2BProspect[];
  updatedAt: string;
};
