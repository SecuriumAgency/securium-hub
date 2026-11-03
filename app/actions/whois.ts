"use server";

import { hasAdminSession } from "@/lib/admin-session";

// Recherche WHOIS via RDAP, le protocole standard qui remplace le WHOIS texte : sans clé, sans paquet système.
// rdap.org redirige vers le registre qui gère le domaine. Une erreur ne sort jamais de cette fonction : elle revient
// sous la forme { ok: false, error }, pour que l'interface l'affiche au lieu de planter.

const RDAP_URL = "https://rdap.org/domain/";
const TIMEOUT_MS = 10_000;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type WhoisResult =
  | { ok: true; registrar: string; expiry: string; status: string; isAvailable: boolean }
  | { ok: false; error: string };

type VcardProperty = [name: string, params: object, type: string, value: unknown];

type RdapDomain = {
  status?: string[];
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: { roles?: string[]; vcardArray?: [string, VcardProperty[]] }[];
};

// Accepte « exemple.fr », « www.exemple.fr » ou une URL complète, et renvoie le nom de domaine nu, ou null.
function normalizeDomain(input: string): string | null {
  const name = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return DOMAIN_PATTERN.test(name) ? name : null;
}

function parseRdap(data: RdapDomain) {
  const registrarEntity = data.entities?.find((entity) => entity.roles?.includes("registrar"));
  const fullName = registrarEntity?.vcardArray?.[1]?.find((property) => property[0] === "fn")?.[3];
  const expiration = data.events?.find((event) => event.eventAction === "expiration")?.eventDate;

  return {
    registrar: typeof fullName === "string" && fullName ? fullName : "Inconnu",
    // La date RDAP est au format ISO : seule la partie « AAAA-MM-JJ » est gardée.
    expiry: expiration ? expiration.slice(0, 10) : "Inconnue",
    status: data.status?.join(", ") || "Inconnu",
  };
}

export async function lookupDomain(domain: string): Promise<WhoisResult> {
  try {
    if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };

    const name = normalizeDomain(domain);
    if (!name) return { ok: false, error: "Domaine invalide : saisissez un nom comme exemple.fr." };

    let response: Response;
    try {
      response = await fetch(`${RDAP_URL}${name}`, {
        headers: { Accept: "application/rdap+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: "Le service WHOIS ne répond pas. Réessayez dans un instant." };
    }

    // 404 : aucun enregistrement RDAP pour ce nom. Certains registres n'exposent pas RDAP : le résultat est alors
    // « disponible » à tort, ce cas est signalé dans l'interface.
    if (response.status === 404) {
      return { ok: true, registrar: "—", expiry: "—", status: "Aucun enregistrement", isAvailable: true };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, error: `Le service WHOIS a répondu ${response.status}.` };
    }

    const data = (await response.json()) as RdapDomain;
    return { ok: true, ...parseRdap(data), isAvailable: false };
  } catch {
    return { ok: false, error: "Recherche WHOIS impossible pour ce domaine." };
  }
}
