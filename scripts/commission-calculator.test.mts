// Tests unitaires du calculateur de commission CPA. Aucune base, aucun appel réseau.
// Lancement : npx tsx scripts/commission-calculator.test.mts (code de sortie 1 si un test échoue).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCPACommission, cpaCommissionTier } from "../lib/commission-calculator.ts";

describe("grille CPA : chaque palier et ses bornes exactes", () => {
  const cases: [number, number][] = [
    [0, 500],
    [1, 500],
    [9_999.99, 500],
    [10_000, 700],
    [14_999.99, 700],
    [15_000, 1_000],
    [24_999.99, 1_000],
    [25_000, 1_500],
    [39_999.99, 1_500],
    [40_000, 2_000],
    [59_999.99, 2_000],
    [60_000, 3_000],
    [99_999.99, 3_000],
    [100_000, 5_000],
    [1_000_000_000, 5_000],
  ];
  for (const [montant, attendu] of cases) {
    it(`${montant} € -> ${attendu} €`, () => {
      assert.equal(calculateCPACommission(montant), attendu);
    });
  }
});

describe("arrondi au centime : aucun trou entre deux bornes", () => {
  it("14 999,996 € arrondi à 15 000,00 € : palier 15 000 €", () => {
    assert.equal(calculateCPACommission(14_999.996), 1_000);
  });
  it("9 999,996 € arrondi à 10 000,00 € : palier 10 000 €", () => {
    assert.equal(calculateCPACommission(9_999.996), 700);
  });
  it("14 999,994 € reste sous 15 000 € : palier 10 000 €", () => {
    assert.equal(calculateCPACommission(14_999.994), 700);
  });
});

describe("libellés des paliers", () => {
  it("10 000 € tombe sur le palier « 10 000 € à 14 999,99 € »", () => {
    assert.equal(cpaCommissionTier(10_000).label, "10 000 € à 14 999,99 €");
  });
  it("100 000 € tombe sur le palier « 100 000 € et plus »", () => {
    assert.equal(cpaCommissionTier(100_000).label, "100 000 € et plus");
  });
});

describe("entrées invalides : rejetées sans valeur de repli", () => {
  it("montant négatif : RangeError", () => {
    assert.throws(() => calculateCPACommission(-1), RangeError);
    assert.throws(() => calculateCPACommission(-0.01), RangeError);
  });
  it("NaN : RangeError", () => {
    assert.throws(() => calculateCPACommission(Number.NaN), RangeError);
  });
  it("infini : RangeError", () => {
    assert.throws(() => calculateCPACommission(Number.POSITIVE_INFINITY), RangeError);
    assert.throws(() => calculateCPACommission(Number.NEGATIVE_INFINITY), RangeError);
  });
  it("valeur non numérique : RangeError", () => {
    assert.throws(() => calculateCPACommission("12000" as unknown as number), RangeError);
    assert.throws(() => calculateCPACommission(undefined as unknown as number), RangeError);
  });
});

describe("effets de bord : aucun état partagé entre les appels", () => {
  it("un appel invalide ne modifie pas les appels suivants", () => {
    assert.throws(() => calculateCPACommission(-5));
    assert.equal(calculateCPACommission(12_000), 700);
    assert.equal(calculateCPACommission(12_000), 700);
  });
  it("la même entrée donne toujours la même sortie", () => {
    const results = Array.from({ length: 50 }, () => calculateCPACommission(45_000));
    assert.ok(results.every((value) => value === 2_000));
  });
});
