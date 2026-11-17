// Tests des liens de rappel des notifications Discord (lib/lead-contact.ts, lib/discord.ts) et de la
// route /appel. Aucune base, aucun appel réseau : rien n'est envoyé à Discord.
// Lancement : npx tsx scripts/lead-contact.test.mts (code de sortie 1 si un test échoue).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET as appel } from "../app/appel/route.ts";
import { buildDiscordPayload } from "../lib/discord.ts";
import { countryOfSite, isMobile, toE164 } from "../lib/lead-contact.ts";
import { middleware } from "../middleware.ts";

const HUB = "https://hub.example";

function lead(siteId: string, name: string, phone: string, service = "burst-pipe-repair (postcode HA1 2AB)") {
  return { id: "lead_1", siteId, name, phone, email: null, service, source: "test", createdAt: new Date("2026-11-17T06:08:00Z") };
}

// Champ « Rappeler » du message, et les URL de ses liens masqués.
function recall(payload: ReturnType<typeof buildDiscordPayload>) {
  const field = payload.embeds[0].fields.find((item) => item.name === "Rappeler");
  const urls = [...(field?.value ?? "").matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  return { field, urls };
}

describe("pays et format E.164", () => {
  it("pays du site d'après son URL", () => {
    assert.equal(countryOfSite("https://www.24-7-rescue-london.co.uk"), "GB");
    assert.equal(countryOfSite("https://www.elite-depannage-34.fr"), "FR");
    assert.equal(countryOfSite(undefined), "FR");
  });
  it("numéros britanniques", () => {
    for (const input of ["07887 410823", "+44 (0)7887 410823", "0044 7887 410823", "+44 07887410823", "+447887410823"]) {
      assert.equal(toE164(input, "GB"), "+447887410823", input);
    }
    assert.equal(toE164("020 7946 0000", "GB"), "+442079460000");
  });
  it("numéros français et étrangers", () => {
    assert.equal(toE164("06 12 34 56 78", "FR"), "+33612345678");
    assert.equal(toE164("+33 6 12 34 56 78", "GB"), "+33612345678");
    assert.equal(toE164("+1 415 555 0100", "GB"), "+14155550100");
  });
  it("saisies illisibles", () => {
    assert.equal(toE164("abc", "GB"), null);
    assert.equal(toE164("12345", "GB"), null);
  });
  it("mobiles", () => {
    assert.equal(isMobile("+447887410823"), true);
    assert.equal(isMobile("+442079460000"), false);
    assert.equal(isMobile("+33612345678"), true);
    assert.equal(isMobile("+33145678901"), false);
    assert.equal(isMobile("+14155550100"), false);
  });
});

describe("message Discord", () => {
  it("mobile UK : Appeler et WhatsApp en anglais, téléphone en E.164", () => {
    const payload = buildDiscordPayload(lead("rescue-247-uk", "Jane Doe", "07887 410823"), HUB);
    const { urls } = recall(payload);
    assert.equal(payload.embeds[0].fields.find((item) => item.name === "Téléphone")?.value, "+447887410823");
    assert.equal(urls[0], `${HUB}/appel?n=%2B447887410823`);
    assert.match(urls[1], /^https:\/\/wa\.me\/447887410823\?text=/);
    assert.equal(
      decodeURIComponent(urls[1].split("text=")[1]),
      "Hi Jane, following your callback request (burst pipe repair (postcode HA1 2AB)): an engineer is ready. Can I call you now?",
    );
  });
  it("fixe UK : Appeler seulement", () => {
    const { urls } = recall(buildDiscordPayload(lead("rescue-247-uk", "Agency", "020 7946 0000"), HUB));
    assert.deepEqual(urls, [`${HUB}/appel?n=%2B442079460000`]);
  });
  it("numéro étranger non mobile : Appeler seulement", () => {
    const { urls } = recall(buildDiscordPayload(lead("rescue-247-uk", "Abroad", "+1 415 555 0100"), HUB));
    assert.deepEqual(urls, [`${HUB}/appel?n=%2B14155550100`]);
  });
  it("site français : numéro national en +33, réponse en français", () => {
    const { urls } = recall(buildDiscordPayload(lead("elite-depannage-34", "Marie Martin", "06 12 34 56 78", "Fuite d'eau"), HUB));
    assert.equal(urls[0], `${HUB}/appel?n=%2B33612345678`);
    assert.match(decodeURIComponent(urls[1]), /^https:\/\/wa\.me\/33612345678\?text=Bonjour Marie, suite à votre demande \(Fuite d'eau\)/);
  });
  it("sans URL publique du Hub : WhatsApp seulement ; numéro illisible : pas de champ Rappeler", () => {
    assert.equal(recall(buildDiscordPayload(lead("rescue-247-uk", "Jane", "07887 410823"), null)).urls.length, 1);
    assert.equal(recall(buildDiscordPayload(lead("rescue-247-uk", "Jane", "n/a"), null)).field, undefined);
  });
  it("aucun lien tel: dans le corps envoyé à Discord, liens tous en https", () => {
    const payload = buildDiscordPayload(lead("rescue-247-uk", "Jane", "07887 410823"), HUB);
    assert.equal(JSON.stringify(payload).includes("tel:"), false);
    for (const url of recall(payload).urls) assert.match(url, /^https:\/\//);
  });
  it("mentions toujours désactivées", () => {
    const payload = buildDiscordPayload(lead("rescue-247-uk", "@everyone", "07887 410823"), HUB);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  });
});

describe("route /appel", () => {
  it("numéro E.164 : redirection 302 vers tel:", () => {
    const response = appel(new NextRequest(`${HUB}/appel?n=%2B447887410823`));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "tel:+447887410823");
  });
  it("tout le reste : 400, jamais de redirection", () => {
    for (const value of ["", "07887410823", "javascript:alert(1)", "https://evil.example", "+44 7887 410823", "+0123456789"]) {
      const response = appel(new NextRequest(`${HUB}/appel?n=${encodeURIComponent(value)}`));
      assert.equal(response.status, 400, value);
      assert.equal(response.headers.get("location"), null, value);
    }
  });
  it("ouverte sans session par le middleware", async () => {
    const response = await middleware(new NextRequest(`${HUB}/appel?n=%2B447887410823`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });
});
