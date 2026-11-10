import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";
import { connect as tlsConnect, type PeerCertificate } from "node:tls";
import { AuditRefusedError, parseTarget, safeLookup } from "./target";
import type { TlsReport } from "./types";

// Sondes passives : une requête GET par saut de redirection, une poignée de main TLS. Aucun chemin sensible,
// aucun scan de ports. Délais et tailles bornés : un site lent ou lourd ne bloque pas l'audit.
export const USER_AGENT = "SecuriumHubAudit/1.0 (audit passif)";
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type PageResponse = { statusCode: number; headers: IncomingHttpHeaders; body: string; ttfbMs: number };

export type FetchOutcome =
  | { ok: true; finalUrl: string; redirects: string[]; response: PageResponse; ttfbMs: number }
  | { ok: false; message: string };

// Message lisible, sans détail interne (ni pile d'appel, ni adresse résolue).
export function describeNetworkError(error: unknown): string {
  if (error instanceof AuditRefusedError) return error.message;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "domaine introuvable";
  if (code === "ECONNREFUSED") return "connexion refusée";
  if (code === "ECONNRESET") return "connexion interrompue";
  if (code === "ETIMEDOUT" || (error instanceof Error && error.message === "Délai dépassé")) return "délai dépassé";
  return "erreur réseau";
}

// Une requête GET sans suivi de redirection. Le corps est lu jusqu'à MAX_BODY_BYTES, puis la lecture s'arrête.
function getPage(url: URL): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const started = performance.now();
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;

    const req = send(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "identity",
        },
        lookup: safeLookup,
      },
      (res: IncomingMessage) => {
        const ttfbMs = performance.now() - started;
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            ttfbMs,
          });
        };
        res.on("data", (chunk: Buffer) => {
          const room = MAX_BODY_BYTES - size;
          if (room > 0) chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += chunk.length;
          if (size > MAX_BODY_BYTES) res.destroy();
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );

    const timer = setTimeout(() => req.destroy(new Error("Délai dépassé")), TIMEOUT_MS);
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    // Sans end(), Node n'envoie jamais la requête : un GET doit être clos explicitement.
    req.end();
  });
}

// Suit les redirections à la main : chaque cible est revalidée avant d'être contactée. La mesure TTFB
// porte sur la première requête.
export async function fetchPage(start: URL): Promise<FetchOutcome> {
  const redirects: string[] = [];
  let current = start;
  let ttfbMs = 0;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: PageResponse;
    try {
      response = await getPage(current);
    } catch (error) {
      return { ok: false, message: describeNetworkError(error) };
    }
    if (hop === 0) ttfbMs = response.ttfbMs;

    const location = response.headers.location;
    if (response.statusCode >= 300 && response.statusCode < 400 && location) {
      let next: URL;
      try {
        next = parseTarget(new URL(location, current).href);
      } catch (error) {
        return {
          ok: false,
          message: error instanceof AuditRefusedError ? `redirection refusée (${error.message})` : "redirection invalide",
        };
      }
      redirects.push(next.href);
      current = next;
      continue;
    }
    return { ok: true, finalUrl: current.href, redirects, response, ttfbMs };
  }
  return { ok: false, message: "trop de redirections" };
}

// Type de contenu HTML, ou absent : la page est analysée comme HTML.
export function isHtml(headers: IncomingHttpHeaders): boolean {
  const type = headers["content-type"] ?? "";
  return type === "" || /html/i.test(type);
}

// Libellés des erreurs de chaîne de confiance les plus fréquentes. Tout autre code reste générique.
const TLS_REASONS: Record<string, string> = {
  CERT_HAS_EXPIRED: "certificat expiré",
  CERT_NOT_YET_VALID: "certificat pas encore valide",
  DEPTH_ZERO_SELF_SIGNED_CERT: "certificat auto-signé",
  SELF_SIGNED_CERT_IN_CHAIN: "chaîne auto-signée",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "émetteur inconnu",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "chaîne de certification incomplète",
  ERR_TLS_CERT_ALTNAME_INVALID: "le certificat ne correspond pas au domaine",
};

const daysUntil = (date: Date) => Math.floor((date.getTime() - Date.now()) / 86_400_000);
// Champs du certificat : un texte, ou une liste de textes dont on garde le premier.
const firstText = (value: unknown): string | null => (Array.isArray(value) ? (typeof value[0] === "string" ? value[0] : null) : typeof value === "string" ? value : null);

// Lit le certificat du serveur. La connexion ne vérifie pas la chaîne elle-même : le verdict vient de
// socket.authorized, ce qui permet de décrire aussi un certificat expiré ou non reconnu.
export function probeTls(host: string): Promise<TlsReport> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (report: TlsReport) => {
      if (settled) return;
      settled = true;
      resolve(report);
    };
    const failure = (error: string): TlsReport => ({ trusted: false, issuer: null, validTo: null, daysLeft: null, error });

    const socket = tlsConnect(
      { host, port: 443, servername: host, rejectUnauthorized: false, lookup: safeLookup },
      () => {
        const certificate: PeerCertificate = socket.getPeerCertificate();
        const validTo = certificate.valid_to ? new Date(certificate.valid_to) : null;
        const validDate = validTo && !Number.isNaN(validTo.getTime()) ? validTo : null;
        const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
        finish({
          trusted: socket.authorized,
          issuer: firstText(certificate.issuer?.O) ?? firstText(certificate.issuer?.CN),
          validTo: validDate ? validDate.toISOString() : null,
          daysLeft: validDate ? daysUntil(validDate) : null,
          error: authorizationError ? (TLS_REASONS[authorizationError] ?? "certificat non reconnu") : null,
        });
        socket.end();
      },
    );
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error("Délai dépassé")));
    socket.on("error", (error) => {
      finish(failure(describeNetworkError(error)));
      socket.destroy();
    });
    socket.on("close", () => finish(failure("connexion TLS interrompue")));
  });
}
