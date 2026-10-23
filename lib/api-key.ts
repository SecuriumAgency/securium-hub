import { createHash, timingSafeEqual } from "node:crypto";

// Vérifie `Authorization: Bearer <secret>` en temps constant. Hacher les deux valeurs aligne leurs
// longueurs, condition de timingSafeEqual, sans révéler la longueur de la clé.
export function isAuthorized(header: string | null, secret: string) {
  const token = header?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(secret));
}
