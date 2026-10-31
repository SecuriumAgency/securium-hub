// Scanner de surface d'attaque interne : contrôle les sites de la flotte sans outil externe.
// Quatre contrôles en parallèle, chacun borné à 5 s : en-têtes de sécurité (HEAD), fichiers .env et .git
// exposés (GET), certificat TLS (validité et date d'expiration).
// Aucune requête ne suit de redirection : une redirection peut pointer vers un hôte interne, et le scanner
// ne doit pas servir de relais. Le contenu d'un fichier exposé n'est ni stocké ni renvoyé, seul le constat l'est.
import tls from "node:tls";

const TIMEOUT_MS = 5000;
const SAMPLE_BYTES = 4096;
const CERT_WARNING_DAYS = 30;
const REQUIRED_HEADERS = ["Strict-Transport-Security", "X-Frame-Options"] as const;

export type Severity = "critical" | "warning";
export type Finding = { severity: Severity; title: string; detail: string };

export type HeadersCheck = {
  status: number | null;
  location?: string;
  present: Record<string, string>;
  missing: string[];
  error?: string;
};

export type ExposureCheck = { path: string; status: number | null; exposed: boolean; error?: string };

export type TlsCheck = {
  checked: boolean;
  authorized?: boolean;
  authorizationError?: string;
  validTo?: string;
  daysRemaining?: number;
  error?: string;
};

export type SecurityReport = {
  target: string;
  scannedAt: string;
  verdict: "ok" | "warning" | "critical";
  headers: HeadersCheck;
  exposures: ExposureCheck[];
  tls: TlsCheck;
  findings: Finding[];
};

export async function runSecurityScan(targetUrl: string): Promise<SecurityReport> {
  const target = new URL(targetUrl);
  const [headers, env, git, tlsCheck] = await Promise.all([
    checkHeaders(target),
    checkExposure(target, "/.env", looksLikeEnvFile),
    checkExposure(target, "/.git/config", looksLikeGitConfig),
    checkTls(target),
  ]);

  const findings = buildFindings(headers, [env, git], tlsCheck);
  return {
    target: target.origin,
    scannedAt: new Date().toISOString(),
    verdict: findings.some((finding) => finding.severity === "critical")
      ? "critical"
      : findings.length > 0
        ? "warning"
        : "ok",
    headers,
    exposures: [env, git],
    tls: tlsCheck,
    findings,
  };
}

// Un .env est une suite de lignes CLE=valeur. Une page HTML (repli d'un site statique ou d'une SPA) n'en est pas une.
export function looksLikeEnvFile(sample: string) {
  if (/<html|<!doctype/i.test(sample)) return false;
  return /^[A-Z][A-Z0-9_]*=/m.test(sample);
}

// Un fichier de configuration git commence par une section [core].
export function looksLikeGitConfig(sample: string) {
  if (/<html|<!doctype/i.test(sample)) return false;
  return /^\[core\]/m.test(sample);
}

async function checkHeaders(target: URL): Promise<HeadersCheck> {
  try {
    const response = await fetch(target, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const present: Record<string, string> = {};
    const missing: string[] = [];
    for (const name of REQUIRED_HEADERS) {
      const value = response.headers.get(name);
      if (value) present[name] = value;
      else missing.push(name);
    }
    return { status: response.status, location: response.headers.get("location") ?? undefined, present, missing };
  } catch (error) {
    return { status: null, present: {}, missing: [...REQUIRED_HEADERS], error: describe(error) };
  }
}

async function checkExposure(target: URL, path: string, looksLike: (sample: string) => boolean): Promise<ExposureCheck> {
  try {
    const response = await fetch(new URL(path, target.origin), {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { path, status: response.status, exposed: false };
    }
    const sample = await readSample(response);
    return { path, status: 200, exposed: looksLike(sample) };
  } catch (error) {
    return { path, status: null, exposed: false, error: describe(error) };
  }
}

// Lit au plus SAMPLE_BYTES octets : un fichier exposé peut être volumineux.
async function readSample(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < SAMPLE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, SAMPLE_BYTES));
}

// Le certificat est lu même invalide (rejectUnauthorized à false) : c'est justement ce qu'il faut signaler.
function checkTls(target: URL): Promise<TlsCheck> {
  if (target.protocol !== "https:") return Promise.resolve({ checked: false });

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: target.hostname,
      port: Number(target.port) || 443,
      servername: target.hostname,
      rejectUnauthorized: false,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ checked: true, error: "Délai dépassé." });
    }, TIMEOUT_MS);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to ? new Date(cert.valid_to) : undefined;
      resolve({
        checked: true,
        authorized: socket.authorized,
        authorizationError: socket.authorized ? undefined : String(socket.authorizationError),
        validTo: validTo?.toISOString(),
        daysRemaining: validTo ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000) : undefined,
      });
      socket.end();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve({ checked: true, error: error.message });
    });
  });
}

function buildFindings(headers: HeadersCheck, exposures: ExposureCheck[], tlsCheck: TlsCheck): Finding[] {
  const findings: Finding[] = [];

  for (const exposure of exposures) {
    if (!exposure.exposed) continue;
    if (exposure.path === "/.env") {
      findings.push({
        severity: "critical",
        title: "Fichier .env accessible",
        detail: "/.env répond 200 avec des lignes CLE=valeur. Retirez-le du déploiement et renouvelez les secrets qu'il contient.",
      });
    }
    if (exposure.path === "/.git/config") {
      findings.push({
        severity: "critical",
        title: "Dépôt .git accessible",
        detail: "/.git/config répond 200 : le dossier .git est servi, son historique peut être téléchargé.",
      });
    }
  }

  if (headers.status === null) {
    findings.push({ severity: "warning", title: "Site injoignable", detail: headers.error ?? "Requête HEAD échouée." });
  }
  for (const name of headers.missing) {
    if (headers.status === null) break;
    findings.push({ severity: "warning", title: `En-tête absent : ${name}`, detail: "Le site ne l'envoie pas dans sa réponse." });
  }

  if (tlsCheck.authorized === false) {
    findings.push({ severity: "critical", title: "Certificat TLS invalide", detail: tlsCheck.authorizationError ?? "Certificat refusé." });
  }
  if (tlsCheck.daysRemaining !== undefined && tlsCheck.daysRemaining < CERT_WARNING_DAYS) {
    findings.push({
      severity: "warning",
      title: "Certificat TLS bientôt expiré",
      detail: `Expiration dans ${tlsCheck.daysRemaining} jour(s).`,
    });
  }
  if (tlsCheck.error) {
    findings.push({ severity: "warning", title: "Contrôle TLS impossible", detail: tlsCheck.error });
  }

  return findings;
}

function describe(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return "Délai dépassé (5 s).";
  return error instanceof Error ? error.message : "Erreur inconnue.";
}

const USER_AGENT = "SecuriumSecurityScan/1.0 (audit interne)";
