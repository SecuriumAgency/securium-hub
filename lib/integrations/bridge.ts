import { NextResponse } from "next/server";

// Ponts du Hub vers les modules de l'écosystème. Chaque route qui s'en sert vérifie la session admin, valide
// son entrée et n'appelle qu'un chemin fixé dans le code : une adresse fournie par le navigateur n'est jamais suivie.
export const NO_STORE = { "Cache-Control": "no-store" };

const DEFAULT_TIMEOUT_MS = 10_000;

// Adresse interne d'un module, sans barre finale. `null` si la variable est absente.
export function moduleUrl(prefix: string) {
  return process.env[`${prefix}_URL`]?.trim().replace(/\/+$/, "") || null;
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
export async function callModule(name: string, url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ModuleFailure(`${name} ne répond pas.`);
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
