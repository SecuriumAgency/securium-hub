import { OPT_OUT_FOOTER } from "./chasseur";

// Lecture des réponses de prospects (bot IMAP, lib/inbound-imap.ts) : texte nouveau et mot STOP.
// Module pur : aucun appel réseau ni base ici.

// Le texte cité (réponse à notre email, qui contient la mention « STOP » du pied de page) ne compte pas : un prospect
// qui répond à une question ne doit pas être désinscrit par la citation de notre propre email.
const QUOTE_START = [
  /^\s*>/, // citation par préfixe
  /a écrit\s*:\s*$/i, // « Le … a écrit : » (Gmail, Thunderbird, Outlook FR)
  /wrote:\s*$/i, // « On … wrote: » (Apple Mail, Gmail en anglais)
  /^\s*-{2,}\s*(Message d'origine|Original Message|Forwarded message)/i,
  /^\s*_{5,}\s*$/, // séparateur Outlook
  /répondez simplement « STOP »/i, // notre pied de page, cité sans préfixe
];

/** Le texte nouveau d'une réponse : tout ce qui précède la première citation. */
export function newContent(text: string): string {
  const kept: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (QUOTE_START.some((pattern) => pattern.test(line))) break;
    kept.push(line);
  }
  return kept.join("\n").split(OPT_OUT_FOOTER).join("").trim();
}

// « STOP » comme mot entier, dans le texte nouveau ou dans l'objet (le lien de désinscription envoie « STOP » en objet).
const STOP_WORD = /(^|[^\p{L}\p{N}_])stop([^\p{L}\p{N}_]|$)/iu;

/** Vrai si le prospect demande à ne plus être contacté. Le texte doit être celui de newContent. */
export function isStopRequest(freshText: string, subject: string) {
  return STOP_WORD.test(freshText) || STOP_WORD.test(subject);
}
