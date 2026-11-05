import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Chiffrement des jetons OAuth (AES-256-CBC). Format stocké : `v1:<iv hex>:<données hex>`.
// Serveur uniquement : la clé IAFLUENCER_ENCRYPTION_KEY ne doit jamais atteindre le navigateur.
// CBC ne détecte pas la falsification : la base doit rester protégée par ses accès (rôles, réseau).

const ALGORITHM = "aes-256-cbc";
const VERSION = "v1";
const IV_BYTES = 16;

function encryptionKey(): Buffer {
  const hex = process.env.IAFLUENCER_ENCRYPTION_KEY?.trim();
  // La valeur n'est jamais affichée dans le message d'erreur.
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("IAFLUENCER_ENCRYPTION_KEY absente ou invalide : 64 caractères hexadécimaux (32 octets) attendus.");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("Format de secret chiffré inconnu.");
  const iv = Buffer.from(parts[1], "hex");
  if (iv.length !== IV_BYTES) throw new Error("Vecteur d'initialisation invalide.");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "hex")), decipher.final()]).toString("utf8");
}
