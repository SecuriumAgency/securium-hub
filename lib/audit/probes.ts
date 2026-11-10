import type { IncomingHttpHeaders } from "node:http";
import { load } from "cheerio";
import type { Alert, HeaderCheck, PerformanceProbe, SecurityProbe, SeoProbe, TlsReport } from "./types";

// Trois sondes pures : entrée = ce que le transport a lu, sortie = score sur 100 et alertes. Aucun appel réseau ici.
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const days = (count: number) => `${count} jour${count > 1 ? "s" : ""}`;

// ---- A. Sécurité : en-têtes HTTP et certificat TLS (100 points : HSTS 25, CSP 25, X-Frame-Options 20, nosniff 10, TLS 20).
export function analyzeSecurity(input: {
  headers: IncomingHttpHeaders | null;
  tls: TlsReport | null;
  httpsSite: boolean;
}): { probe: SecurityProbe; alerts: Alert[] } {
  const alerts: Alert[] = [];
  const read = (name: string): string | null => {
    const value = input.headers?.[name];
    if (value === undefined) return null;
    return Array.isArray(value) ? value.join(", ") : value;
  };
  const hsts = read("strict-transport-security");
  const csp = read("content-security-policy");
  const xfo = read("x-frame-options");
  const nosniff = read("x-content-type-options");
  // frame-ancestors dans la CSP remplace X-Frame-Options : les deux protègent du clickjacking.
  const framed = csp !== null && /frame-ancestors/i.test(csp);
  const noSniffOk = nosniff !== null && nosniff.toLowerCase().includes("nosniff");

  const headers: HeaderCheck[] = [
    { label: "Strict-Transport-Security (HSTS)", present: hsts !== null, value: hsts, points: hsts ? 25 : 0, maxPoints: 25 },
    { label: "Content-Security-Policy", present: csp !== null, value: csp, points: csp ? 25 : 0, maxPoints: 25 },
    {
      label: "X-Frame-Options",
      present: xfo !== null || framed,
      value: xfo ?? (framed ? "frame-ancestors (CSP)" : null),
      points: xfo !== null || framed ? 20 : 0,
      maxPoints: 20,
    },
    { label: "X-Content-Type-Options", present: nosniff !== null, value: nosniff, points: noSniffOk ? 10 : 0, maxPoints: 10 },
  ];

  let tlsPoints = 0;
  const tls = input.httpsSite ? input.tls : null;
  if (tls && tls.trusted && tls.daysLeft !== null && tls.daysLeft > 30) tlsPoints = 20;
  else if (tls && tls.trusted && tls.daysLeft !== null && tls.daysLeft > 7) tlsPoints = 10;

  if (!input.httpsSite) {
    alerts.push({ probe: "security", severity: "critical", message: "Site servi en HTTP : aucun chiffrement des échanges" });
  }
  // Sans réponse HTTP, l'absence d'en-têtes ne prouve rien : on ne lève pas d'alerte sur des en-têtes non lus.
  if (input.headers) {
    if (!hsts) {
      alerts.push({ probe: "security", severity: "warning", message: "En-tête Strict-Transport-Security absent : HSTS non activé" });
    }
    if (!csp) {
      alerts.push({ probe: "security", severity: "warning", message: "Content-Security-Policy absente : aucune restriction sur les scripts et ressources" });
    }
    if (xfo === null && !framed) {
      alerts.push({ probe: "security", severity: "warning", message: "X-Frame-Options absent : le site peut être affiché dans une iframe (clickjacking)" });
    }
    if (!noSniffOk) {
      alerts.push({ probe: "security", severity: "info", message: "X-Content-Type-Options absent ou différent de nosniff" });
    }
  }
  if (tls) {
    if (tls.daysLeft !== null && tls.daysLeft < 0) {
      alerts.push({ probe: "security", severity: "critical", message: `Certificat SSL expiré depuis ${days(-tls.daysLeft)}` });
    } else if (!tls.trusted) {
      alerts.push({ probe: "security", severity: "critical", message: `Certificat SSL non reconnu : ${tls.error ?? "motif inconnu"}` });
    } else if (tls.daysLeft !== null && tls.daysLeft <= 7) {
      alerts.push({ probe: "security", severity: "critical", message: `SSL expire dans ${days(tls.daysLeft)}` });
    } else if (tls.daysLeft !== null && tls.daysLeft <= 30) {
      alerts.push({ probe: "security", severity: "warning", message: `SSL expire dans ${days(tls.daysLeft)}` });
    }
  }

  const headerPoints = headers.reduce((sum, header) => sum + header.points, 0);
  return { probe: { score: clamp(headerPoints + tlsPoints), headers, tls, httpsSite: input.httpsSite }, alerts };
}

// ---- B. SEO et structure : balises du HTML brut (100 points : titre 25, description 25, H1 20, canonical 15, texte 15).
export function analyzeSeo(html: string): { probe: SeoProbe; alerts: Alert[] } {
  const $ = load(html);
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
  const title = collapse($("title").first().text()) || null;
  const description = collapse($('meta[name="description" i]').first().attr("content") ?? "") || null;
  const h1Count = $("h1").length;
  const canonical = $('link[rel="canonical" i]').first().attr("href")?.trim() || null;

  // Texte visible : scripts, styles et gabarits retirés. Le ratio compare ce texte à la taille du HTML brut.
  $("script, style, noscript, template, svg").remove();
  const visible = collapse($.root().text());
  const textRatio = html.length > 0 ? Math.round((visible.length / html.length) * 1000) / 10 : 0;

  const titleLength = title?.length ?? 0;
  const descriptionLength = description?.length ?? 0;
  const score =
    (title === null ? 0 : titleLength >= 30 && titleLength <= 60 ? 25 : 15) +
    (description === null ? 0 : descriptionLength >= 70 && descriptionLength <= 160 ? 25 : 15) +
    (h1Count === 1 ? 20 : h1Count > 1 ? 10 : 0) +
    (canonical ? 15 : 0) +
    (textRatio >= 10 ? 15 : textRatio >= 5 ? 8 : 0);

  const alerts: Alert[] = [];
  if (title === null) alerts.push({ probe: "seo", severity: "critical", message: "Balise <title> absente" });
  else if (titleLength < 30 || titleLength > 60) {
    alerts.push({ probe: "seo", severity: "info", message: `Titre de ${titleLength} caractères (recommandé : 30 à 60)` });
  }
  if (description === null) alerts.push({ probe: "seo", severity: "warning", message: "Meta description absente" });
  else if (descriptionLength < 70 || descriptionLength > 160) {
    alerts.push({ probe: "seo", severity: "info", message: `Meta description de ${descriptionLength} caractères (recommandé : 70 à 160)` });
  }
  if (h1Count === 0) alerts.push({ probe: "seo", severity: "critical", message: "Balise H1 manquante" });
  else if (h1Count > 1) alerts.push({ probe: "seo", severity: "warning", message: `${h1Count} balises H1 (une seule recommandée)` });
  if (!canonical) alerts.push({ probe: "seo", severity: "warning", message: "Balise canonical absente" });
  if (textRatio < 5) alerts.push({ probe: "seo", severity: "warning", message: `Ratio texte/code faible (${textRatio} %)` });
  else if (textRatio < 10) alerts.push({ probe: "seo", severity: "info", message: `Ratio texte/code modeste (${textRatio} %)` });

  return {
    probe: { score: clamp(score), title, titleLength, description, descriptionLength, h1Count, canonical, textRatio },
    alerts,
  };
}

// ---- C. Performance (baseline) : TTFB de la requête initiale, graduée par paliers.
export function analyzePerformance(ttfbMs: number, statusCode: number): { probe: PerformanceProbe; alerts: Alert[] } {
  const alerts: Alert[] = [];
  let score = ttfbMs <= 200 ? 100 : ttfbMs <= 500 ? 80 : ttfbMs <= 800 ? 50 : ttfbMs <= 1500 ? 25 : 10;
  if (statusCode >= 400) score = Math.min(score, 20);

  const rounded = Math.round(ttfbMs);
  if (ttfbMs > 1500) alerts.push({ probe: "performance", severity: "critical", message: `TTFB de ${rounded} ms (cible : moins de 800 ms)` });
  else if (ttfbMs > 800) alerts.push({ probe: "performance", severity: "warning", message: `TTFB de ${rounded} ms (cible : moins de 800 ms)` });
  if (statusCode >= 400) alerts.push({ probe: "performance", severity: "critical", message: `Réponse HTTP ${statusCode} : page inaccessible` });
  alerts.push({ probe: "performance", severity: "info", message: "Mesure unique du TTFB : valeur indicative, à confirmer sur plusieurs passages" });

  return { probe: { score: clamp(score), ttfbMs: rounded, statusCode }, alerts };
}
