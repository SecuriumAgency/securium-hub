import { performance } from "node:perf_hooks";
import { analyzePerformance, analyzeSecurity, analyzeSeo } from "./probes";
import { assertPublicHost, hostOf, parseTarget } from "./target";
import { fetchPage, isHtml, probeTls } from "./transport";
import type { Alert, AuditReport } from "./types";

// Moteur d'audit : valide la cible, lance les sondes (TLS et HTTP en parallèle), puis calcule scores et alertes.
// Ne lève une exception que pour une cible refusée (AuditRefusedError). Un site injoignable produit un rapport.
export { AuditRefusedError } from "./target";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);

export async function runAudit(raw: string): Promise<AuditReport> {
  const started = performance.now();
  const target = parseTarget(raw);
  await assertPublicHost(hostOf(target));

  const httpsSite = target.protocol === "https:";
  const [tls, outcome] = await Promise.all([httpsSite ? probeTls(hostOf(target)) : Promise.resolve(null), fetchPage(target)]);

  const reachable = outcome.ok;
  const response = outcome.ok ? outcome.response : null;
  const security = analyzeSecurity({ headers: response?.headers ?? null, tls, httpsSite });
  const seo = response && isHtml(response.headers) ? analyzeSeo(response.body) : null;
  const performanceResult = outcome.ok ? analyzePerformance(outcome.ttfbMs, response?.statusCode ?? 0) : null;

  const alerts: Alert[] = [...security.alerts, ...(seo?.alerts ?? []), ...(performanceResult?.alerts ?? [])];
  if (!outcome.ok) {
    alerts.unshift({ probe: "access", severity: "critical", message: `Site injoignable : ${outcome.message}` });
  } else if (response && !isHtml(response.headers)) {
    alerts.push({ probe: "seo", severity: "info", message: "Réponse non HTML : analyse SEO non réalisée" });
  }
  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Un site injoignable n'a pas de score : ses sondes n'ont rien mesuré. Sinon, la moyenne ne porte que sur les sondes
  // qui ont produit un résultat.
  const securityScore = reachable ? security.probe.score : 0;
  const seoScore = seo?.probe.score ?? 0;
  const performanceScore = performanceResult?.probe.score ?? 0;
  const global = reachable ? average([securityScore, ...(seo ? [seoScore] : []), ...(performanceResult ? [performanceScore] : [])]) : 0;

  return {
    requestedUrl: target.href,
    finalUrl: outcome.ok ? outcome.finalUrl : null,
    redirects: outcome.ok ? outcome.redirects : [],
    reachable,
    analyzedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    scores: { global, security: securityScore, seo: seoScore, performance: performanceScore },
    security: { ...security.probe, score: securityScore },
    seo: seo?.probe ?? null,
    performance: performanceResult?.probe ?? null,
    alerts,
  };
}
