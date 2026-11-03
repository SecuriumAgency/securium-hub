// Scanner Core Web Vitals pour l'avant-vente. Interroge l'API PageSpeed Insights (stratégie mobile) et affiche le score
// de performance, le LCP, le CLS et un diagnostic PASS / FAIL. Usage : npm run audit -- https://site-du-prospect.com
// Clé facultative : PAGESPEED_API_KEY. Sans clé, l'API publique limite vite le nombre d'appels.

// PAGESPEED_API_URL permet de viser un autre point d'accès, par exemple un serveur de test local.
const API_URL = process.env.PAGESPEED_API_URL?.trim() || "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// PageSpeed charge la page dans un vrai navigateur : une réponse prend souvent plusieurs dizaines de secondes.
const TIMEOUT_MS = 120_000;
// Sous ce score, le diagnostic est FAIL et la phrase d'alerte est générée.
const PASS_SCORE = 70;
// Seuils Core Web Vitals publiés par Google (web.dev) : « bon », puis « à améliorer », au-delà « mauvais ».
const LCP_GOOD_MS = 2500;
const LCP_POOR_MS = 4000;
const CLS_GOOD = 0.1;
const CLS_POOR = 0.25;

type PageSpeedResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
  error?: { message?: string };
};

type Metrics = { score: number; lcpMs: number; cls: number };

type Rating = "bon" | "à améliorer" | "mauvais";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (text: string) => paint(1, text);
const green = (text: string) => paint(32, text);
const yellow = (text: string) => paint(33, text);
const red = (text: string) => paint(31, text);

// Accepte « site.com » comme « https://site.com ». Lève une erreur lisible si l'adresse ne désigne pas un site.
function parseTarget(raw: string | undefined): string {
  const text = raw?.trim();
  if (!text) throw new Error("URL manquante. Exemple : npm run audit -- https://site-du-prospect.com");

  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`URL invalide : « ${text} ».`);
  }
  if (!url.hostname.includes(".")) throw new Error(`Nom de domaine invalide : « ${url.hostname} ».`);
  return url.href;
}

async function fetchReport(target: string): Promise<PageSpeedResponse> {
  const params = new URLSearchParams({ url: target, strategy: "mobile", category: "performance" });
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (key) params.set("key", key);

  let response: Response;
  try {
    response = await fetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error("L'API PageSpeed Insights ne répond pas (réseau ou délai dépassé).");
  }

  const data = (await response.json().catch(() => ({}))) as PageSpeedResponse;
  if (response.status === 429) {
    throw new Error("Quota de l'API PageSpeed atteint. Réessayez plus tard ou renseignez PAGESPEED_API_KEY.");
  }
  if (!response.ok) {
    throw new Error(`PageSpeed a refusé la demande : ${data.error?.message ?? `erreur ${response.status}`}`);
  }
  return data;
}

function extractMetrics(data: PageSpeedResponse): Metrics {
  const lighthouse = data.lighthouseResult;
  const score = lighthouse?.categories?.performance?.score;
  const lcpMs = lighthouse?.audits?.["largest-contentful-paint"]?.numericValue;
  const cls = lighthouse?.audits?.["cumulative-layout-shift"]?.numericValue;

  if (typeof score !== "number" || typeof lcpMs !== "number" || typeof cls !== "number") {
    throw new Error("Rapport PageSpeed incomplet : score, LCP ou CLS absent. La page est peut-être inaccessible.");
  }
  return { score: Math.round(score * 100), lcpMs, cls };
}

function rate(value: number, good: number, poor: number): Rating {
  if (value <= good) return "bon";
  if (value <= poor) return "à améliorer";
  return "mauvais";
}

function badge(rating: Rating): string {
  if (rating === "bon") return green(`🟢 ${rating}`);
  if (rating === "à améliorer") return yellow(`🟡 ${rating}`);
  return red(`🔴 ${rating}`);
}

const frenchNumber = (value: number, digits: number) => value.toFixed(digits).replace(".", ",");

// La phrase « perd X% » n'est générée que si AUDIT_PERTE_VISITEURS_PCT fournit un pourcentage sourcé. Sans lui, la phrase
// ne cite aucun chiffre inventé et s'appuie sur le seuil publié par Google.
function alertSentence(metrics: Metrics): string {
  const seconds = frenchNumber(metrics.lcpMs / 1000, 1);
  const lostPercent = Number(process.env.AUDIT_PERTE_VISITEURS_PCT);
  if (process.env.AUDIT_PERTE_VISITEURS_PCT && lostPercent > 0 && lostPercent < 100) {
    return `⚠️ ALERTE : Votre site perd ${lostPercent}% de ses visiteurs sur mobile à cause d'un temps de chargement de ${seconds} secondes.`;
  }
  return `⚠️ ALERTE : Sur mobile, le contenu principal de votre site ne s'affiche qu'après ${seconds} secondes. Google juge une page lente au-delà de 2,5 secondes : vos visiteurs mobiles attendent trop longtemps.`;
}

async function main() {
  const target = parseTarget(process.argv[2]);
  console.log(bold(`\n🔍 Audit PageSpeed Insights (mobile) : ${target}`));
  console.log("⏳ Analyse en cours, cela peut prendre une minute…\n");

  const metrics = extractMetrics(await fetchReport(target));
  const passed = metrics.score >= PASS_SCORE;
  const scoreText = `${metrics.score} / 100`;

  console.log(`  🎯 Score de performance : ${bold(passed ? green(scoreText) : red(scoreText))}`);
  console.log(
    `  ⏱️  LCP (affichage du contenu principal) : ${frenchNumber(metrics.lcpMs / 1000, 1)} s  ${badge(rate(metrics.lcpMs, LCP_GOOD_MS, LCP_POOR_MS))}`,
  );
  console.log(
    `  📐 CLS (stabilité visuelle) : ${frenchNumber(metrics.cls, 3)}  ${badge(rate(metrics.cls, CLS_GOOD, CLS_POOR))}`,
  );

  console.log("");
  console.log(passed ? bold(green(`  ✅ PASS (score ≥ ${PASS_SCORE})`)) : bold(red(`  ❌ FAIL (score < ${PASS_SCORE})`)));

  if (!passed) {
    console.log(bold("\n  📋 Phrase prête à copier-coller :"));
    console.log(red(`  ${alertSentence(metrics)}\n`));
  }
}

main().catch((error: unknown) => {
  console.error(red(`❌ ${error instanceof Error ? error.message : "Erreur inattendue."}`));
  process.exitCode = 1;
});
