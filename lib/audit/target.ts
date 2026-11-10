import { lookup as lookupAsync } from "node:dns/promises";
import { lookup as lookupCallback } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Anti-SSRF. Une cible d'audit doit être un site public, en http ou https, sur les ports par défaut, sans identifiants.
// Trois barrières : (1) syntaxe de l'URL, à la saisie ; (2) résolution DNS, avant la première requête ;
// (3) résolution à chaque connexion (safeLookup) : l'adresse réellement utilisée est revérifiée, ce qui ferme le
// « DNS rebinding » (un nom public qui pointerait vers une adresse interne au moment de la connexion).

export class AuditRefusedError extends Error {}

// Plages non publiques : privées, bouclage, liaison locale, partage d'opérateur, documentation, multicast, réservées.
// Le mappage IPv4 dans IPv6 et la traduction NAT64 sont bloqués en bloc, par prudence.
// Une liste par famille : dans une liste mixte, une plage IPv6 (ex. ::ffff:0:0/96) capturerait aussi les adresses IPv4.
const INTERNAL_V4 = new BlockList();
const INTERNAL_V6 = new BlockList();
const IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const IPV6_RANGES: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["fe80::", 10],
  ["fec0::", 10],
  ["fc00::", 7],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
];
for (const [address, prefix] of IPV4_RANGES) INTERNAL_V4.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of IPV6_RANGES) INTERNAL_V6.addSubnet(address, prefix, "ipv6");

export function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return INTERNAL_V4.check(address, "ipv4");
  if (family === 6) return INTERNAL_V6.check(address, "ipv6");
  return true; // ni IPv4 ni IPv6 : refusé par prudence
}

// Noms qui désignent une machine interne, même lorsqu'ils ont un point (ex. box.lan).
const INTERNAL_NAMES = /(^|\.)(localhost|localdomain|local|internal|intranet|lan|home|corp|home\.arpa)$/i;

// Hôte sans crochets (les adresses IPv6 gardent les crochets dans URL.hostname).
export const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, "");

// Contrôle syntaxique de la saisie. Lève AuditRefusedError avec un motif lisible.
export function parseTarget(raw: string): URL {
  const text = raw.trim();
  if (text.length === 0 || text.length > 2048) throw new AuditRefusedError("URL absente ou trop longue.");

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AuditRefusedError("URL invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AuditRefusedError("Seuls les protocoles http et https sont acceptés.");
  }
  if (url.username !== "" || url.password !== "") throw new AuditRefusedError("Identifiants dans l'URL refusés.");
  // URL retire déjà le port par défaut de son protocole : un port restant est un port non standard.
  if (url.port !== "") throw new AuditRefusedError("Seuls les ports par défaut (80 et 443) sont audités.");

  const host = hostOf(url);
  if (isIP(host)) {
    if (isInternalAddress(host)) throw new AuditRefusedError("Adresse IP non publique refusée.");
  } else if (!host.includes(".") || INTERNAL_NAMES.test(host)) {
    throw new AuditRefusedError("Nom d'hôte interne refusé.");
  }
  return url;
}

// Première barrière DNS : le nom doit exister, et aucune de ses adresses ne doit être interne.
export async function assertPublicHost(host: string): Promise<void> {
  if (isIP(host)) return; // une adresse littérale est déjà contrôlée par parseTarget
  let addresses: { address: string }[];
  try {
    addresses = await lookupAsync(host, { all: true, verbatim: true });
  } catch {
    throw new AuditRefusedError("Domaine introuvable.");
  }
  if (addresses.some((entry) => isInternalAddress(entry.address))) {
    throw new AuditRefusedError("Ce domaine pointe vers une adresse non publique.");
  }
}

// Résolution utilisée par chaque connexion (HTTP et TLS). Node l'appelle au moment de se connecter.
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  lookupCallback(hostname, { all: true, verbatim: true }, (error, addresses) => {
    // Node ignore l'adresse quand l'erreur est renseignée : les valeurs de remplacement ne sont jamais utilisées.
    if (error) return callback(error, "", 0);
    if (addresses.some((entry) => isInternalAddress(entry.address))) {
      return callback(new AuditRefusedError("Adresse non publique refusée."), "", 0);
    }
    if (options.all) return callback(null, addresses, 0);
    callback(null, addresses[0].address, addresses[0].family);
  });
};
