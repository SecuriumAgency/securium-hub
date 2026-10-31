import { NextResponse } from "next/server";

// Ponts du Hub vers les modules de l'écosystème. Chaque route qui s'en sert vérifie la session admin, valide
// son entrée et n'appelle qu'un chemin fixé dans le code : une adresse fournie par le navigateur n'est jamais suivie.
export const NO_STORE = { "Cache-Control": "no-store" };

const DEFAULT_TIMEOUT_MS = 10_000;

// Adresse interne d'un module, sans barre finale. `null` si la variable est absente.
export function moduleUrl(prefix: string) {
  return process.env[`${prefix}_URL`]?.trim().replace(/\/+$/, "") || null;
}

// En-têtes du jeton de service Cloudflare Access, ajoutés à chaque appel d'un module. Ils ne partent que vers une
// adresse https : le secret ne doit jamais circuler en clair. Sans jeton configuré, aucun en-tête n'est ajouté.
export function accessHeaders(url: string): Record<string, string> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!clientId || !clientSecret || !url.startsWith("https://")) return {};
  return { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret };
}

// Cloudflare Access refuse une requête sans jeton valide : 403, ou redirection vers sa page de connexion.
export function isAccessDenied(response: Response) {
  if (response.status === 401 || response.status === 403) return true;
  const location = response.headers.get("location") ?? "";
  return response.status >= 300 && response.status < 400 && location.includes("cloudflareaccess.com");
}

// Erreur attendue côté module : son message est sûr à renvoyer, le corps de sa réponse ne l'est pas.
export class ModuleFailure extends Error {}

export function unauthorized() {
  return NextResponse.json({ error: "Session admin requise." }, { status: 401, headers: NO_STORE });
}

export function notConfigured(name: string, variables: string[]) {
  return NextResponse.json(
    { error: `${name} n'est pas configuré : renseigner ${variables.join(", ")}.` },
    { status: 503, headers: NO_STORE },
  );
}

export function invalidInput(message: string) {
  return NextResponse.json({ error: message }, { status: 422, headers: NO_STORE });
}

// Appel d'un module, borné par `timeoutMs`. Une réponse qui n'est pas un succès lève ModuleFailure.
// `redirect: "manual"` : une redirection du module n'est jamais suivie, elle échoue comme une erreur.
export async function callModule(
  name: string,
  url: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...accessHeaders(url), ...init.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ModuleFailure(`${name} ne répond pas.`);
  }
  if (isAccessDenied(response)) {
    await response.body?.cancel();
    throw new ModuleFailure(`${name} refuse l'accès (Cloudflare Access).`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ModuleFailure(`${name} a répondu ${response.status}.`);
  }
  return response;
}

// Réponse d'échec d'une route de pont. Une erreur inattendue ne révèle rien de plus qu'un message générique.
export function moduleFailure(error: unknown) {
  const message = error instanceof ModuleFailure ? error.message : "Le module a renvoyé une réponse inattendue.";
  return NextResponse.json({ error: message }, { status: 502, headers: NO_STORE });
}
