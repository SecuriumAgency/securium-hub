import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "./session";

// Session admin portée par le cookie de la requête en cours (route API, action serveur). Le middleware
// filtre déjà toutes les routes non publiques ; une route qui lit ou modifie des données la revérifie
// elle-même, pour ne pas dépendre de la seule configuration du matcher.
export async function hasAdminSession() {
  const secret = sessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(secret && (await verifySessionToken(token, secret)));
}
