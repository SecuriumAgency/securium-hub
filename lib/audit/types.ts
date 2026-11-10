// Rapport du moteur d'audit B2B. Types seuls : l'interface les importe sans embarquer le code serveur.
export type Severity = "critical" | "warning" | "info";
export type Probe = "access" | "security" | "seo" | "performance";

export type Alert = { probe: Probe; severity: Severity; message: string };

export type HeaderCheck = {
  label: string;
  present: boolean;
  value: string | null;
  points: number;
  maxPoints: number;
};

export type TlsReport = {
  // true : la chaîne de confiance est reconnue par Node.
  trusted: boolean;
  issuer: string | null;
  validTo: string | null;
  daysLeft: number | null;
  error: string | null;
};

export type SecurityProbe = {
  score: number;
  headers: HeaderCheck[];
  // null : site servi en HTTP, pas de certificat à lire.
  tls: TlsReport | null;
  httpsSite: boolean;
};

export type SeoProbe = {
  score: number;
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  h1Count: number;
  canonical: string | null;
  // Part du texte visible dans le HTML brut, en pourcentage (une décimale).
  textRatio: number;
};

export type PerformanceProbe = {
  score: number;
  // Une seule mesure, sur la requête initiale (avant redirections) : valeur indicative.
  ttfbMs: number;
  statusCode: number;
};

export type AuditReport = {
  requestedUrl: string;
  finalUrl: string | null;
  redirects: string[];
  reachable: boolean;
  analyzedAt: string;
  durationMs: number;
  scores: { global: number; security: number; seo: number; performance: number };
  security: SecurityProbe;
  seo: SeoProbe | null;
  performance: PerformanceProbe | null;
  // Classées de la plus grave à la moins grave.
  alerts: Alert[];
};
