// Tests de la matrice d'adjacence et du matching élargi du Matchmaker. Aucune base, aucun appel réseau.
// Lancement : npx tsx scripts/geo-adjacency.test.mts (code de sortie 1 si un test échoue).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEPARTMENT_NEIGHBORS, expandZones, neighborsOf } from "../lib/geo-adjacency.ts";
import { ADJACENT_SCORE, evaluateMatchmaker } from "../lib/matchmaker.ts";

describe("matrice d'adjacence : cohérence", () => {
  it("96 départements : France métropolitaine et Corse", () => {
    assert.equal(Object.keys(DEPARTMENT_NEIGHBORS).length, 96);
  });
  it("symétrie : A voisin de B si et seulement si B voisin de A", () => {
    for (const [department, neighbors] of Object.entries(DEPARTMENT_NEIGHBORS)) {
      for (const neighbor of neighbors) {
        assert.ok(DEPARTMENT_NEIGHBORS[neighbor]?.includes(department), `${department} -> ${neighbor} sans retour`);
      }
    }
  });
  it("aucun département n'est son propre voisin, et chaque voisin est une clé de la matrice", () => {
    for (const [department, neighbors] of Object.entries(DEPARTMENT_NEIGHBORS)) {
      assert.ok(!neighbors.includes(department), `${department} voisin de lui-même`);
      for (const neighbor of neighbors) assert.ok(neighbor in DEPARTMENT_NEIGHBORS, `${neighbor} absent de la matrice`);
    }
  });
});

describe("voisinages connus", () => {
  it("Paris (75) n'a que trois voisins : 92, 93, 94", () => {
    assert.deepEqual([...neighborsOf("75")].sort(), ["92", "93", "94"]);
  });
  it("Val-d'Oise (95) touche les Yvelines, les Hauts-de-Seine, la Seine-Saint-Denis, l'Oise et l'Eure", () => {
    for (const neighbor of ["78", "92", "93", "60", "27"]) assert.ok(neighborsOf("95").includes(neighbor), `95 sans ${neighbor}`);
  });
  it("Hérault (34) touche l'Aude, l'Aveyron, le Gard, la Lozère et le Tarn", () => {
    assert.deepEqual([...neighborsOf("34")].sort(), ["11", "12", "30", "48", "81"]);
  });
  it("un code absent de la matrice (DOM, code inconnu) n'a aucun voisin", () => {
    assert.deepEqual([...neighborsOf("971")], []);
    assert.deepEqual([...neighborsOf("xx")], []);
  });
});

describe("expandZones : zones de base plus limitrophes, sans doublon", () => {
  it("un département élargi contient ses voisins et garde la zone de base", () => {
    const expanded = expandZones(["95"]);
    assert.ok(expanded.includes("95"));
    for (const neighbor of ["78", "92", "60", "27"]) assert.ok(expanded.includes(neighbor), `sans ${neighbor}`);
  });
  it("un code postal élargi utilise son département : 95100 donne les voisins du 95", () => {
    const expanded = expandZones(["95100"]);
    assert.ok(expanded.includes("95100"));
    assert.ok(expanded.includes("78"));
    assert.ok(!expanded.includes("95"), "le département lui-même n'est pas un voisin");
  });
  it("aucun doublon, même quand deux zones de base se touchent", () => {
    const expanded = expandZones(["75", "92"]);
    assert.equal(new Set(expanded).size, expanded.length);
    assert.equal(expanded.filter((zone) => zone === "92").length, 1);
  });
});

describe("evaluateMatchmaker : zone exacte, département, limitrophe, refus", () => {
  const partner = { targetNiches: ["toiture"], targetZipCodes: ["78"] };
  const lead = (postalCode: string | null, niche = "toiture") => ({ niche, postalCode, region: null });

  it("zone exacte : score 100, non limitrophe", () => {
    const result = evaluateMatchmaker(lead("78000"), { targetNiches: ["toiture"], targetZipCodes: ["78000"] });
    assert.equal(result.eligible, true);
    assert.equal(result.score, 100);
    assert.equal(result.adjacent, false);
  });
  it("même département : score 80, non limitrophe", () => {
    const result = evaluateMatchmaker(lead("78200"), partner);
    assert.equal(result.eligible, true);
    assert.equal(result.score, 80);
    assert.equal(result.adjacent, false);
  });
  it("département voisin (95 voisin du 78) : compatible, limitrophe, score ADJACENT_SCORE", () => {
    const result = evaluateMatchmaker(lead("95100"), partner);
    assert.equal(result.eligible, true);
    assert.equal(result.score, ADJACENT_SCORE);
    assert.equal(result.adjacent, true);
  });
  it("département non voisin (13) : refusé", () => {
    const result = evaluateMatchmaker(lead("13001"), partner);
    assert.equal(result.eligible, false);
  });
  it("niche non couverte : refusé, même en zone limitrophe", () => {
    const result = evaluateMatchmaker(lead("95100", "isolation"), partner);
    assert.equal(result.eligible, false);
  });
  it("zone de base en code postal : un lead du département voisin reste limitrophe", () => {
    const result = evaluateMatchmaker(lead("95100"), { targetNiches: ["toiture"], targetZipCodes: ["78000"] });
    assert.equal(result.eligible, true);
    assert.equal(result.adjacent, true);
  });
});
