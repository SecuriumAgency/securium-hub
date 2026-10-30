// Audit SEO d'une page, sans dépendance externe. Onze agents, chacun regroupe des contrôles mesurés sur le
// HTML de la page et sur deux fichiers du site (robots.txt, sitemap.xml). Un agent sans contrôle mesurable
// a un score `null` et n'entre pas dans la moyenne : le rapport dit ce qui n'a pas été mesuré.
// Fonctions pures : la récupération des pages est dans lib/seo/audit.ts.

export type CheckResult = { id: string; label: string; passed: boolean; detail: string; advice: string };

export type AgentReport = {
  id: string;
  name: string;
  // Pourcentage de contrôles passés ; null : rien de mesurable ici.
  score: number | null;
  note: string;
  checks: CheckResult[];
};

export type SeoAudit = {
  siteId: string;
  siteName: string;
  url: string;
  measuredAt: string;
  // Moyenne des scores mesurés, sur 100. 0 quand rien n'a pu être mesuré.
  score: number;
  coverage: { measured: number; total: number };
  agents: AgentReport[];
  // Actions issues des contrôles échoués, dans l'ordre des agents.
  recommendations: string[];
};

// Ce que la récupération du site apporte. `null` : la requête a échoué (réseau, délai dépassé).
export type PageFacts = {
  url: string;
  pageStatus: number | null;
  html: string;
  noindexHeader: boolean;
  robotsStatus: number | null;
  robotsText: string;
  sitemapStatus: number | null;
};

type Attributes = Partial<Record<string, string>>;

// Attributs d'une balise ouvrante : `<a href="/x" rel=nofollow>` donne { href: "/x", rel: "nofollow" }.
function attributes(tag: string): Attributes {
  const body = tag.replace(/^<[a-zA-Z0-9]+/, "").replace(/\/?>$/, "");
  const found: Attributes = {};
  for (const match of body.matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return found;
}

// Balises d'un type, avec leurs attributs. Une expression régulière suffit pour des contrôles de présence.
function tagsOf(html: string, name: string): Attributes[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => attributes(match[0]));
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

// Lien interne : chemin relatif, ou adresse du même hôte que la page.
function isInternal(href: string, pageUrl: string): boolean {
  if (href.startsWith("#") || href.startsWith("//") || /^(mailto|tel|javascript|data):/i.test(href)) return false;
  if (!/^https?:\/\//i.test(href)) return true;
  try {
    return new URL(href).host === new URL(pageUrl).host;
  } catch {
    return false;
  }
}

function check(id: string, label: string, passed: boolean, detail: string, advice: string): CheckResult {
  return { id, label, passed, detail, advice };
}

function agent(id: string, name: string, checks: CheckResult[], note = ""): AgentReport {
  const passed = checks.filter((item) => item.passed).length;
  return {
    id,
    name,
    score: checks.length === 0 ? null : Math.round((passed / checks.length) * 100),
    note,
    checks,
  };
}

export function auditPage(facts: PageFacts): AgentReport[] {
  const html = facts.html;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const meta = tagsOf(html, "meta");
  const metaNamed = (name: string) => meta.find((item) => item.name?.toLowerCase() === name)?.content?.trim() ?? "";
  const description = metaNamed("description");
  const viewport = metaNamed("viewport");
  const noindex = facts.noindexHeader || /noindex/i.test(metaNamed("robots"));
  const lang = tagsOf(html, "html")[0]?.lang?.trim() ?? "";

  const h1Count = tagsOf(html, "h1").length;
  const hasMain = tagsOf(html, "main").length > 0;
  const images = tagsOf(html, "img");
  const imagesWithoutAlt = images.filter((image) => image.alt === undefined).length;
  const imagesWithoutSize = images.filter((image) => image.width === undefined || image.height === undefined).length;

  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "";
  const blockingScripts = tagsOf(head, "script").filter(
    (script) => script.src !== undefined && script.async === undefined && script.defer === undefined && script.type !== "module",
  ).length;

  const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  );
  const jsonLdValid = jsonLd.filter((block) => {
    try {
      JSON.parse(block);
      return true;
    } catch {
      return false;
    }
  }).length;

  const links = tagsOf(html, "a")
    .map((anchor) => anchor.href ?? "")
    .filter((href) => href !== "");
  const internalLinks = new Set(links.filter((href) => isInternal(href, facts.url))).size;
  const text = visibleText(html);
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasContactChannel = links.some((href) => /^(tel|mailto):/i.test(href)) || tagsOf(html, "form").length > 0;
  const hasCta = /(devis|contact|rappel|appelez|réserv|demande)/i.test(text);

  const sitemapListed = /^\s*sitemap:/im.test(facts.robotsText);

  return [
    agent(
      "cwv",
      "Core Web Vitals",
      [
        check(
          "render-blocking",
          "Scripts bloquant le rendu",
          blockingScripts === 0,
          `${blockingScripts} script(s) bloquant(s) dans le head`,
          "Ajouter defer ou async aux scripts du head pour accélérer le LCP.",
        ),
        check(
          "image-size",
          "Dimensions des images",
          imagesWithoutSize === 0,
          `${imagesWithoutSize} image(s) sans width ou height`,
          "Renseigner width et height sur chaque image pour limiter le CLS.",
        ),
      ],
      "Indicatif : ces contrôles lisent le HTML. LCP, INP et CLS se mesurent dans un navigateur (PageSpeed Insights).",
    ),
    agent("semantic", "Audit sémantique et mots-clés", [
      check("title", "Balise title", title !== "", title ? `« ${title} »` : "absente", "Ajouter une balise title qui décrit la page."),
      check("h1", "Un seul h1", h1Count === 1, `${h1Count} h1`, "Garder exactement un h1 par page, porteur du sujet principal."),
      check("words", "Au moins 300 mots", words >= 300, `${words} mots visibles`, "Étoffer le contenu utile de la page : 300 mots au minimum."),
    ]),
    agent("linking", "Maillage interne", [
      check(
        "internal-links",
        "Au moins 5 liens internes",
        internalLinks >= 5,
        `${internalLinks} lien(s) interne(s) distinct(s)`,
        "Relier la page aux pages de services et de contact.",
      ),
    ]),
    agent("schema", "Balisage Schema.org", [
      check(
        "jsonld-present",
        "Bloc JSON-LD présent",
        jsonLd.length > 0,
        `${jsonLd.length} bloc(s)`,
        "Ajouter un bloc JSON-LD (LocalBusiness ou Organization).",
      ),
      check(
        "jsonld-valid",
        "JSON-LD valide",
        jsonLd.length > 0 && jsonLdValid === jsonLd.length,
        `${jsonLdValid}/${jsonLd.length} bloc(s) lisibles`,
        "Corriger la syntaxe JSON des blocs JSON-LD.",
      ),
    ]),
    agent("meta", "Meta titles et descriptions", [
      check(
        "title-length",
        "Title de 30 à 60 caractères",
        title.length >= 30 && title.length <= 60,
        `${title.length} caractères`,
        "Viser un title de 30 à 60 caractères.",
      ),
      check(
        "description",
        "Description de 70 à 160 caractères",
        description.length >= 70 && description.length <= 160,
        `${description.length} caractères`,
        "Rédiger une description de 70 à 160 caractères avec un appel à l’action.",
      ),
    ]),
    agent(
      "backlinks",
      "Analyse des backlinks",
      [],
      "Non mesuré : un index de liens externes (Ahrefs, Majestic…) est nécessaire. Pas encore branché.",
    ),
    agent(
      "duplicates",
      "Détection du contenu dupliqué",
      [],
      "Non mesuré : la comparaison demande plusieurs pages. Une seule page est auditée ici.",
    ),
    agent(
      "a11y",
      "Accessibilité (WCAG)",
      [
        check("lang", "Langue déclarée", lang !== "", lang || "absente", "Déclarer la langue de la page sur la balise html."),
        check(
          "alt",
          "Images avec attribut alt",
          imagesWithoutAlt === 0,
          `${imagesWithoutAlt} image(s) sans alt`,
          "Ajouter un attribut alt à chaque image (vide si l’image est décorative).",
        ),
        check("main", "Repère main", hasMain, hasMain ? "présent" : "absent", "Encadrer le contenu principal par une balise main."),
        check(
          "zoom",
          "Zoom non bloqué",
          !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![\d.])/i.test(viewport),
          "zoom autorisé",
          "Retirer user-scalable=no et maximum-scale du viewport.",
        ),
      ],
      "Le contraste se vérifie sur le rendu, pas sur le HTML : non mesuré ici.",
    ),
    agent("mobile", "Compatibilité mobile", [
      check(
        "viewport",
        "Viewport adapté à l’écran",
        /width\s*=\s*device-width/i.test(viewport),
        viewport || "absent",
        'Déclarer <meta name="viewport" content="width=device-width, initial-scale=1">.',
      ),
    ]),
    agent("indexation", "Indexation (sitemap, robots.txt)", [
      check(
        "page-200",
        "La page répond 200",
        facts.pageStatus === 200,
        `statut ${facts.pageStatus ?? "injoignable"}`,
        "Corriger la réponse de la page.",
      ),
      check(
        "robots",
        "robots.txt accessible",
        facts.robotsStatus === 200,
        `statut ${facts.robotsStatus ?? "injoignable"}`,
        "Publier un robots.txt à la racine du site.",
      ),
      check(
        "sitemap-listed",
        "Sitemap déclaré dans robots.txt",
        sitemapListed,
        sitemapListed ? "déclaré" : "absent",
        "Ajouter une ligne Sitemap: dans robots.txt.",
      ),
      check(
        "sitemap",
        "sitemap.xml accessible",
        facts.sitemapStatus === 200,
        `statut ${facts.sitemapStatus ?? "injoignable"}`,
        "Publier un sitemap.xml et le soumettre à Search Console.",
      ),
      check(
        "indexable",
        "Page indexable",
        !noindex,
        noindex ? "noindex détecté" : "indexable",
        "Retirer noindex de la page si elle doit apparaître dans les résultats.",
      ),
    ]),
    agent("conversion", "Conversion (UX vers SEO)", [
      check(
        "contact-channel",
        "Canal de contact cliquable",
        hasContactChannel,
        hasContactChannel ? "tel, mailto ou formulaire" : "aucun",
        "Ajouter un lien tel: ou un formulaire de contact visible.",
      ),
      check(
        "cta",
        "Appel à l’action explicite",
        hasCta,
        hasCta ? "présent" : "absent",
        "Écrire un appel à l’action (devis, contact, rappel) dans la première partie de la page.",
      ),
    ]),
  ];
}

// Score global : moyenne des agents mesurés. Les recommandations viennent des contrôles échoués.
export function summarize(site: { id: string; name: string; url: string }, agents: AgentReport[], now: Date): SeoAudit {
  const measured = agents.filter((item) => item.score !== null);
  const score = measured.length === 0 ? 0 : Math.round(measured.reduce((sum, item) => sum + (item.score ?? 0), 0) / measured.length);
  const recommendations = [
    ...new Set(
      agents.flatMap((item) => item.checks.filter((check) => !check.passed).map((check) => `${item.name} : ${check.advice}`)),
    ),
  ].slice(0, 20);
  return {
    siteId: site.id,
    siteName: site.name,
    url: site.url,
    measuredAt: now.toISOString(),
    score,
    coverage: { measured: measured.length, total: agents.length },
    agents,
    recommendations,
  };
}
