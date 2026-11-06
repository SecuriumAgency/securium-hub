import { sessionSecret } from "@/lib/session";

// Lien de déclaration d'un acheteur : jeton signé HMAC-SHA256 (Web Crypto), qui porte l'identifiant
// du prospect et une expiration. Rien n'est stocké en base : pas de colonne, pas de migration.
// La clé est dérivée de SESSION_SECRET avec un libellé propre, pour qu'un cookie de session ne soit
// jamais un jeton de déclaration, et l'inverse non plus.

export const DECLARATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const PROSPECT_ID = /^[a-z0-9]{1,40}$/;
const TOKEN = /^([A-Za-z0-9_-]{1,400})\.([0-9a-f]{64})$/;

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function hmacKey(usage: "sign" | "verify") {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET absent ou trop court.");
  return crypto.subtle.importKey("raw", encoder.encode(`broker-declaration:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** Jeton de déclaration pour un prospect, ou null si le secret serveur manque. */
export async function createDeclarationToken(prospectId: string, now = Date.now()): Promise<string | null> {
  if (!PROSPECT_ID.test(prospectId) || !sessionSecret()) return null;
  const payload = Buffer.from(JSON.stringify({ id: prospectId, exp: now + DECLARATION_TTL_MS }), "utf8").toString("base64url");
  const signature = await crypto.subtle.sign("HMAC", await hmacKey("sign"), encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

/** Identifiant du prospect si le jeton est authentique et non expiré, sinon null. Ne lève jamais d'erreur sur une entrée arbitraire. */
export async function readDeclarationToken(token: string, now = Date.now()): Promise<string | null> {
  const match = TOKEN.exec(token);
  if (!match || !sessionSecret()) return null;
  const [, payload, signature] = match;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey("verify"), fromHex(signature), encoder.encode(payload));
  if (!valid) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { id, exp } = claims as { id?: unknown; exp?: unknown };
  if (typeof id !== "string" || !PROSPECT_ID.test(id)) return null;
  if (typeof exp !== "number" || exp <= now) return null;
  return id;
}
