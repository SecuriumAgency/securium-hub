// Limite de débit simple, en mémoire, par adresse IP. Protection de base contre le spam sur une route publique.
// Limite connue : chaque instance serverless tient son propre compteur. Un blocage fiable demande un
// stockage partagé (par exemple Vercel Runtime Cache ou une base).

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterS: number };

export function takeRateLimit(key: string, options: { max: number; windowMs: number }, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => now - time < options.windowMs);

  if (bucket.hits.length >= options.max) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { allowed: false, retryAfterS: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Nettoyage léger : évite de garder indéfiniment les clés inactives.
  if (buckets.size > 5000) {
    for (const [name, value] of buckets) {
      if (value.hits.every((time) => now - time >= options.windowMs)) buckets.delete(name);
    }
  }
  return { allowed: true };
}
