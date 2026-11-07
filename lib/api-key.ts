import { createHash, timingSafeEqual } from "node:crypto";

// Compare deux secrets en temps constant. Hacher les deux valeurs aligne leurs longueurs, condition de
// timingSafeEqual, sans révéler la longueur de la clé.
export function secretMatches(given: string, secret: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

// Vérifie `Authorization: Bearer <secret>`.
export function isAuthorized(header: string | null, secret: string) {
  const token = header?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return secretMatches(token, secret);
}
