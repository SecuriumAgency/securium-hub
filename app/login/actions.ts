"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret } from "@/lib/session";

export type LoginState = { error?: string };

// Comparaison en temps constant, comme pour HUB_SECRET_KEY : hacher les deux valeurs aligne leurs
// longueurs sans révéler celle du mot de passe.
function isAdminPassword(candidate: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const expected = process.env.ADMIN_PASSWORD;
  const secret = sessionSecret();
  if (!expected || !secret) {
    console.error("[login] ADMIN_PASSWORD ou SESSION_SECRET (32 caractères minimum) n'est pas défini.");
    return { error: "Connexion non configurée sur le serveur." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !isAdminPassword(password, expected)) {
    return { error: "Mot de passe incorrect." };
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
