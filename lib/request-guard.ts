// Garde des requêtes publiques : origine officielle et adresse du client. Fonctions pures, sans état.

// Seules ces origines peuvent poster un formulaire public. Le formulaire /devis vit sur le Hub ; les deux autres
// domaines sont ceux de l'agence. Hors production, localhost est aussi accepté pour le développement.
export const OFFICIAL_ORIGINS = ["https://hub.securium-agency.fr", "https://www.securium-agency.fr", "https://securium-agency.fr"] as const;
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

export function allowedOrigins(): ReadonlySet<string> {
  return new Set<string>(process.env.NODE_ENV === "production" ? OFFICIAL_ORIGINS : [...OFFICIAL_ORIGINS, ...DEV_ORIGINS]);
}

// Origine (schéma, hôte, port) d'une URL, ou null si elle n'est pas une URL valide (« null », valeur forgée…).
function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export type OriginCheck = { allowed: true } | { allowed: false; reason: string };

// Un navigateur envoie Origin sur chaque POST, même en même origine : c'est lui qui fait foi. Sans Origin, on lit Referer.
// Une requête sans aucun des deux en-têtes est refusée.
export function checkOrigin(request: Request, allowed: ReadonlySet<string> = allowedOrigins()): OriginCheck {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    return allowed.has(originOf(origin) ?? "") ? { allowed: true } : { allowed: false, reason: "origine non officielle" };
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    return allowed.has(originOf(referer) ?? "") ? { allowed: true } : { allowed: false, reason: "référent non officiel" };
  }
  return { allowed: false, reason: "aucune origine" };
}

// Adresse du client : l'en-tête x-real-ip posé par l'hébergeur d'abord, puis le premier saut de x-forwarded-for.
// Un client peut forger x-forwarded-for si l'hébergeur ne le réécrit pas : c'est pourquoi x-real-ip passe avant.
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "inconnu";
}
