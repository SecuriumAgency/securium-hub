// Session admin : cookie `<expiration en ms>.<signature>`, signé HMAC-SHA256 avec SESSION_SECRET.
// La valeur ne contient rien de secret (seulement l'expiration) : la signature suffit à la rendre
// infalsifiable, sans chiffrement. Web Crypto plutôt que node:crypto : le module tourne aussi
// dans le middleware.
export const SESSION_COOKIE = "securium_admin_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

// Un secret court se casserait hors ligne à partir d'un seul cookie.
const MIN_SECRET_LENGTH = 32;
const TOKEN = /^(\d+)\.([0-9a-f]{64})$/;
const encoder = new TextEncoder();

// `undefined` si SESSION_SECRET est absent ou trop court : aucune session ne peut alors être créée
// ni acceptée.
export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : undefined;
}

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function createSessionToken(secret: string, now = Date.now()) {
  const expiresAt = String(now + SESSION_MAX_AGE_S * 1000);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(expiresAt));
  return `${expiresAt}.${toHex(signature)}`;
}

// subtle.verify compare les signatures en temps constant.
export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()) {
  const match = token?.match(TOKEN);
  if (!match) return false;
  const [, expiresAt, signature] = match;
  if (Number(expiresAt) <= now) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromHex(signature), encoder.encode(expiresAt));
}
