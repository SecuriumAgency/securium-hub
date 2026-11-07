// Grille de commission CPA (apporteur d'affaires), fournie par le partenaire. Calcul sur le montant HT du chantier.
// Pur : aucun accès à la base, aucun effet de bord, aucun appel externe.
//
// Les montants sont ramenés au centime avant comparaison : une valeur comme 14 999,996 € tombe dans le palier
// « 15 000 € » et non dans un trou entre deux bornes. Les paliers sont inclusifs en bas et exclusifs en haut.

type CommissionTier = {
  /** Borne basse incluse, en centimes. */
  fromCents: number;
  /** Borne haute exclue, en centimes. Infinity pour le dernier palier. */
  toCents: number;
  /** Libellé lisible, affiché à l'utilisateur. */
  label: string;
  /** Commission due pour ce palier, en euros. */
  commission: number;
};

/** Euros en centimes : les bornes sont exprimées en centimes pour rester exactes. */
const centimes = (value: number) => value * 100;

export const CPA_COMMISSION_TIERS: readonly CommissionTier[] = [
  { fromCents: 0, toCents: centimes(10_000), label: "Moins de 10 000 €", commission: 500 },
  { fromCents: centimes(10_000), toCents: centimes(15_000), label: "10 000 € à 14 999,99 €", commission: 700 },
  { fromCents: centimes(15_000), toCents: centimes(25_000), label: "15 000 € à 24 999,99 €", commission: 1_000 },
  { fromCents: centimes(25_000), toCents: centimes(40_000), label: "25 000 € à 39 999,99 €", commission: 1_500 },
  { fromCents: centimes(40_000), toCents: centimes(60_000), label: "40 000 € à 59 999,99 €", commission: 2_000 },
  { fromCents: centimes(60_000), toCents: centimes(100_000), label: "60 000 € à 99 999,99 €", commission: 3_000 },
  { fromCents: centimes(100_000), toCents: Infinity, label: "100 000 € et plus", commission: 5_000 },
];

/** Montant HT valide : un nombre fini, positif ou nul, en euros. Lève une RangeError sinon. */
function assertValidAmount(montantHT: number): void {
  if (typeof montantHT !== "number" || !Number.isFinite(montantHT) || montantHT < 0) {
    throw new RangeError(`Montant HT invalide : « ${String(montantHT)} ». Un montant positif ou nul, en euros, est attendu.`);
  }
}

/** Palier applicable à un montant HT. Lève une RangeError si le montant est négatif, infini ou non numérique. */
export function cpaCommissionTier(montantHT: number): CommissionTier {
  assertValidAmount(montantHT);
  const cents = Math.round(montantHT * 100);
  const tier = CPA_COMMISSION_TIERS.find((candidate) => cents >= candidate.fromCents && cents < candidate.toCents);
  // Les paliers couvrent [0, +∞) sans trou : un résultat vide serait une erreur de la grille elle-même.
  if (!tier) throw new Error("Grille CPA incohérente : aucun palier ne couvre ce montant.");
  return tier;
}

/** Commission CPA due, en euros, pour un chantier de montant HT donné (en euros). */
export function calculateCPACommission(montantHT: number): number {
  return cpaCommissionTier(montantHT).commission;
}
