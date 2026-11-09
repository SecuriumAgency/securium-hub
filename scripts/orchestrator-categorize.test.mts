// Tests du classifieur de l'Orchestrateur et du contrôle d'accès du webhook. Aucune base, aucun appel réseau :
// les cas qui atteignent la base (rapport valide) ne sont pas couverts ici.
// Lancement : npx tsx scripts/orchestrator-categorize.test.mts (code de sortie 1 si un test échoue).
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { classify } from "../lib/orchestrator/categorize.ts";
import { POST } from "../app/api/webhooks/orchestrator/route.ts";

describe("classifieur : type de tâche", () => {
  it("trafic en baisse -> SEO", () => {
    assert.equal(classify("Chute de trafic sur elite-depannage").type, "SEO");
  });
  it("erreur serveur -> DEV", () => {
    assert.equal(classify("Erreur 500 sur /api/leads").type, "DEV");
  });
  it("tentative d'injection -> SECURITE", () => {
    assert.equal(classify("Tentative d'injection SQL détectée").type, "SECURITE");
  });
  it("mise en page cassée sur mobile -> UI", () => {
    assert.equal(classify("Mise en page cassée sur mobile, CLS élevé").type, "UI");
  });
  it("sans mot-clé -> DEV (repli)", () => {
    const result = classify("Rapport hebdomadaire sans détail");
    assert.equal(result.type, "DEV");
    assert.equal(result.keyword, null);
  });
  it("insensible aux accents et à la casse", () => {
    assert.equal(classify("SÉCURITÉ : fuite de token").type, "SECURITE");
  });
  it("priorité : une erreur de build l'emporte sur une baisse de trafic", () => {
    assert.equal(classify("Chute de trafic après une erreur de build").type, "DEV");
  });
  it("priorité : la sécurité l'emporte sur tout", () => {
    assert.equal(classify("Erreur et chute de trafic : vulnerabilite critique").type, "SECURITE");
  });
});

describe("webhook Orchestrateur : contrôle d'accès et de format (sans base)", () => {
  const url = "http://localhost/api/webhooks/orchestrator";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ORCHESTRATOR_TOKEN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ORCHESTRATOR_TOKEN;
    else process.env.ORCHESTRATOR_TOKEN = saved;
  });

  const post = (headers: Record<string, string>, body: string) =>
    POST(new Request(url, { method: "POST", headers, body }) as never);

  it("sans ORCHESTRATOR_TOKEN : 503, rien n'est accepté", async () => {
    delete process.env.ORCHESTRATOR_TOKEN;
    const res = await post({ authorization: "Bearer x" }, "{}");
    assert.equal(res.status, 503);
  });
  it("mauvais jeton : 401", async () => {
    process.env.ORCHESTRATOR_TOKEN = "secret-test";
    const res = await post({ authorization: "Bearer mauvais" }, "{}");
    assert.equal(res.status, 401);
  });
  it("jeton absent : 401", async () => {
    process.env.ORCHESTRATOR_TOKEN = "secret-test";
    const res = await post({}, "{}");
    assert.equal(res.status, 401);
  });
  it("jeton valide, corps non JSON : 400", async () => {
    process.env.ORCHESTRATOR_TOKEN = "secret-test";
    const res = await post({ authorization: "Bearer secret-test" }, "pas du json");
    assert.equal(res.status, 400);
  });
  it("jeton valide, gravité inconnue : 422", async () => {
    process.env.ORCHESTRATOR_TOKEN = "secret-test";
    const res = await post(
      { authorization: "Bearer secret-test" },
      JSON.stringify({ source: "elite-depannage-34", severity: "panique", message: "x" }),
    );
    assert.equal(res.status, 422);
  });
});
