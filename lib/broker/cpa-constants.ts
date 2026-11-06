// Constantes du mode apporteur d'affaires (CPA), sans accès à la base : utilisables côté navigateur.

export const PARTNERSHIP_TYPES = ["CPL", "CPA"] as const;
export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number];

export const DEAL_STATUSES = ["TRANSMIS", "DEVIS_EN_COURS", "SIGNE", "CHANTIER_DEMARRE", "COMMISSION_PAYEE"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_LABELS: Record<DealStatus, string> = {
  TRANSMIS: "Transmis",
  DEVIS_EN_COURS: "Devis en cours",
  SIGNE: "Signé",
  CHANTIER_DEMARRE: "Chantier démarré",
  COMMISSION_PAYEE: "Commission payée",
};

export const PARTNERSHIP_LABELS: Record<PartnershipType, string> = {
  CPL: "💰 Mode CPL",
  CPA: "🤝 Apporteur d'affaires",
};
