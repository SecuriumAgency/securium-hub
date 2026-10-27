"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, MIN_SECRET_LENGTH, SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret } from "@/lib/session";

// `config` : le serveur ne peut pas vérifier de mot de passe, il manque une variable d'environnement.
// `password` : la configuration est complète, le mot de passe saisi est refusé.
export type LoginError = { cause: "config" | "password"; messages: string[] };
export type LoginState = { error?: LoginError };

// Comparaison en temps constant, comme pour HUB_SECRET_KEY : hacher les deux valeurs aligne leurs
// longueurs sans révéler celle du mot de passe.
function isAdminPassword(candidate: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

// Affiché sur /login, page publique : nomme les variables en cause, jamais leur valeur ni leur
// longueur. Tant qu'une variable manque, aucune connexion n'est possible, donc rien n'est révélé
// qui aide à entrer.
function configIssues(expected: string | undefined, secret: string | undefined) {
  const issues: string[] = [];
  if (!expected) issues.push("Variable ADMIN_PASSWORD manquante dans .env.local ou Vercel.");
  if (!secret) {
    issues.push(
      process.env.SESSION_SECRET
        ? `Variable SESSION_SECRET trop courte : ${MIN_SECRET_LENGTH} caractères minimum.`
        : "Variable SESSION_SECRET manquante dans .env.local ou Vercel.",
    );
  }
  return issues;
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  // `echo … | vercel env add` laisse un retour à la ligne final dans la valeur : on l'ignore, et une
  // valeur faite seulement d'espaces compte comme absente.
  const expected = process.env.ADMIN_PASSWORD?.trim();
  const secret = sessionSecret();
  const issues = configIssues(expected, secret);
  if (!expected || !secret) {
    console.error(`[login] Configuration incomplète : ${issues.join(" ")}`);
    return { error: { cause: "config", messages: issues } };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !isAdminPassword(password, expected)) {
    return { error: { cause: "password", messages: ["Mot de passe incorrect."] } };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    // En dev, le Hub tourne en HTTP : certains navigateurs n'y renvoient pas un cookie Secure.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect("/");
}
