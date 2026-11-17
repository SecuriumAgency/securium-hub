// Liens de rappel d'un lead pour la notification Discord : numéro au format E.164, lien « Appeler »
// et réponse WhatsApp pré-remplie. Fonctions pures, sans réseau (testées par
// scripts/lead-contact.test.mts).

export type Country = "GB" | "FR";

const DIAL_CODE: Record<Country, string> = { GB: "44", FR: "33" };

// Pays d'un site de la flotte, d'après son URL de production : .uk pour le Royaume-Uni, la France sinon.
export function countryOfSite(siteUrl: string | undefined): Country {
  try {
    return siteUrl && new URL(siteUrl).hostname.endsWith(".uk") ? "GB" : "FR";
  } catch {
    return "FR";
  }
}

// Numéro au format E.164 (« +447887410823 »), ou null s'il ne se lit pas comme un numéro. Un numéro
// national (« 07… », « 06… ») prend l'indicatif du pays du site ; « (0) » et le 0 qui suit
// l'indicatif (« +44 07… ») sont retirés.
export function toE164(phone: string, country: Country): string | null {
  const compact = phone.replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  const international = /^(?:\+|00)([1-9]\d{7,14})$/.exec(compact);
  if (international) return `+${international[1].replace(/^(44|33)0/, "$1")}`;
  const national = /^0(\d{9,10})$/.exec(compact);
  return national ? `+${DIAL_CODE[country]}${national[1]}` : null;
}

// WhatsApp ne fonctionne que sur un mobile : +447 au Royaume-Uni, +336 et +337 en France.
export function isMobile(e164: string): boolean {
  return /^\+447\d{9}$/.test(e164) || /^\+33[67]\d{8}$/.test(e164);
}

// « burst-pipe-repair (postcode HA1 2AB) » -> « burst pipe repair (postcode HA1 2AB) ».
function readableService(service: string): string {
  return service.replace(/^([a-z0-9]+(?:-[a-z0-9]+)+)/, (id) => id.replace(/-/g, " "));
}

// Réponse WhatsApp au prospect, dans la langue du site, ou null si le numéro n'est pas un mobile.
// Sans nom de marque : le nom du site dans le Hub n'est pas toujours celui que voit le client.
export function whatsappReplyLink(e164: string | null, country: Country, name: string, service: string): string | null {
  if (!e164 || !isMobile(e164)) return null;
  const firstName = name.trim().split(/\s+/)[0];
  const job = readableService(service);
  const text =
    country === "GB"
      ? `Hi ${firstName}, following your callback request (${job}): an engineer is ready. Can I call you now?`
      : `Bonjour ${firstName}, suite à votre demande (${job}) : un technicien est disponible. Puis-je vous appeler maintenant ?`;
  return `https://wa.me/${e164.slice(1)}?text=${strictEncode(text)}`;
}

// encodeURIComponent laisse passer ! ' ( ) * : une parenthèse fermante couperait le lien masqué
// Discord [texte](url) au milieu de l'URL (le service contient « (postcode …) »).
function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Lien « Appeler » : Discord n'ouvre que les liens http(s), pas tel:. La route publique /appel du Hub
// renvoie vers tel:<numéro>. Null sans URL publique du Hub.
export function callLink(e164: string | null, hubOrigin: string | null): string | null {
  if (!e164 || !hubOrigin) return null;
  return `${hubOrigin}/appel?n=${encodeURIComponent(e164)}`;
}
