// Rapport quotidien de la flotte (scripts/fleet-daily-report.mts) : mise en page reprise du « Rapport
// digital quotidien » de securium-agency-v2 (lib/network-report.ts : en-tête noir, cartes d'indicateurs,
// tableaux, pied de page), avec les données du Hub. Styles en ligne, seuls lus par les messageries.
import type { SiteStatus } from "./sites";

export type FleetReportData = {
  // « samedi 24 octobre 2026 »
  dateLabel: string;
  // false : VERCEL_API_TOKEN absent, statuts des sites inconnus.
  vercelAvailable: boolean;
  sites: { name: string; status: SiteStatus; leadsToday: number; leadsMonth: number; leadsTotal: number }[];
  outreach: { prospects: number; contacted: number; drafts: number; sentToday: number; repliesToday: number };
};

export const REPORT_TITLE = "Rapport quotidien — flotte";
export const REPORT_FOOTER = "Rapport généré automatiquement chaque jour à 20h (heure de Paris) — Securium Hub.";

const STATUS_BADGES: Record<SiteStatus, { label: string; color: string; background: string }> = {
  online: { label: "En ligne", color: "#166534", background: "#dcfce7" },
  offline: { label: "Hors ligne", color: "#991b1b", background: "#fee2e2" },
  unknown: { label: "Inconnu", color: "#3f3f46", background: "#f4f4f5" },
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const cell = "padding:10px 6px; border-bottom:1px solid #e4e4e7; font-family:Arial, sans-serif; font-size:13px;";
const head =
  "padding:8px 6px; border-bottom:2px solid #18181b; font-family:Arial, sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#71717a;";
const sectionTitle = (title: string, top = 32) =>
  `<h3 style="color:#18181b; font-family:Arial, sans-serif; font-size:16px; margin:${top}px 0 12px;">${escapeHtml(title)}</h3>`;

function kpiCard(label: string, value: string) {
  return `
    <td style="padding: 8px;">
      <div style="background:#0a0a0a; border:1px solid #262626; border-radius:16px; padding:20px; text-align:center;">
        <div style="color:#f59e0b; font-size:26px; font-weight:800; font-family:Arial, sans-serif;">${escapeHtml(value)}</div>
        <div style="color:#a1a1aa; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; margin-top:6px; font-family:Arial, sans-serif;">${escapeHtml(label)}</div>
      </div>
    </td>`;
}

export function fleetTotals({ sites, outreach }: FleetReportData) {
  return {
    leadsToday: sites.reduce((sum, site) => sum + site.leadsToday, 0),
    leadsMonth: sites.reduce((sum, site) => sum + site.leadsMonth, 0),
    online: sites.filter((site) => site.status === "online").length,
    sites: sites.length,
    ...outreach,
  };
}

function overviewHtml(data: FleetReportData) {
  const totals = fleetTotals(data);
  return `
    ${sectionTitle("Vue d'ensemble de la flotte", 0)}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${kpiCard("Leads du jour", String(totals.leadsToday))}
        ${kpiCard("Leads du mois", String(totals.leadsMonth))}
        ${kpiCard("Sites en ligne", `${totals.online}/${totals.sites}`)}
      </tr>
      <tr>
        ${kpiCard("Brouillons à valider", String(totals.drafts))}
        ${kpiCard("Emails envoyés", String(totals.sentToday))}
        ${kpiCard("Réponses reçues", String(totals.repliesToday))}
      </tr>
    </table>
    <p style="color:#a1a1aa; font-family:Arial, sans-serif; font-size:12px; margin:4px 8px 0;">Emails envoyés et réponses reçues : aujourd'hui.</p>`;
}

function sitesHtml({ sites, vercelAvailable }: FleetReportData) {
  const rows = sites
    .map((site) => {
      const badge = STATUS_BADGES[site.status];
      return `
      <tr>
        <td style="${cell} color:#18181b; font-weight:700;">${escapeHtml(site.name)}</td>
        <td style="${cell} text-align:right;">
          <span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; color:${badge.color}; background:${badge.background};">${badge.label}</span>
        </td>
        <td style="${cell} color:#d97706; font-weight:700; text-align:right;">${site.leadsToday}</td>
        <td style="${cell} color:#18181b; text-align:right;">${site.leadsMonth}</td>
        <td style="${cell} color:#18181b; text-align:right;">${site.leadsTotal}</td>
      </tr>`;
    })
    .join("");
  const notice = vercelAvailable
    ? ""
    : `<p style="color:#92400e; font-family:Arial, sans-serif; font-size:12px; margin:0 0 8px;">VERCEL_API_TOKEN absent : statuts des déploiements inconnus.</p>`;
  return `
    ${sectionTitle("Sites de la flotte")}${notice}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="${head}">Site</td>
        <td style="${head} text-align:right;">Déploiement</td>
        <td style="${head} text-align:right;">Leads jour</td>
        <td style="${head} text-align:right;">Mois</td>
        <td style="${head} text-align:right;">Total</td>
      </tr>
      ${rows}
    </table>`;
}

function outreachHtml({ outreach }: FleetReportData) {
  const line = (label: string, value: number, accent = false) => `
      <tr>
        <td style="${cell} color:#18181b;">${escapeHtml(label)}</td>
        <td style="${cell} color:${accent ? "#d97706" : "#18181b"}; font-weight:700; text-align:right; width:60px;">${value}</td>
      </tr>`;
  return `
    ${sectionTitle("Prospection (agent Chasseur)")}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${line("Prospects en base", outreach.prospects)}
      ${line("Prospects déjà contactés", outreach.contacted)}
      ${line("Brouillons en attente de validation", outreach.drafts, outreach.drafts > 0)}
      ${line("Emails envoyés aujourd'hui", outreach.sentToday)}
      ${line("Réponses reçues aujourd'hui", outreach.repliesToday, outreach.repliesToday > 0)}
    </table>`;
}

export function buildFleetReportHtml(data: FleetReportData) {
  return `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:24px; overflow:hidden;">
            <tr>
              <td style="background:#000000; padding:32px 40px;">
                <div style="color:#f59e0b; font-size:12px; letter-spacing:0.15em; text-transform:uppercase; font-weight:700;">Securium Agency</div>
                <div style="color:#ffffff; font-size:22px; font-weight:800; margin-top:6px;">${escapeHtml(REPORT_TITLE)}</div>
                <div style="color:#a1a1aa; font-size:13px; margin-top:4px; text-transform:capitalize;">${escapeHtml(data.dateLabel)}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 40px 40px;">
                ${overviewHtml(data)}
                ${sitesHtml(data)}
                ${outreachHtml(data)}
              </td>
            </tr>

            <tr>
              <td style="background:#fafafa; padding:20px 40px; border-top:1px solid #e4e4e7;">
                <p style="color:#a1a1aa; font-size:11px; margin:0;">
                  ${escapeHtml(REPORT_FOOTER)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Version texte de repli, pour les messageries qui n'affichent pas le HTML.
export function buildFleetReportText(data: FleetReportData) {
  const totals = fleetTotals(data);
  const status = (value: SiteStatus) => STATUS_BADGES[value].label;
  return [
    `${REPORT_TITLE} — ${data.dateLabel}`,
    "",
    `Leads du jour : ${totals.leadsToday} · du mois : ${totals.leadsMonth} · sites en ligne : ${totals.online}/${totals.sites}`,
    "",
    "Sites de la flotte :",
    ...data.sites.map((site) => `- ${site.name} : ${status(site.status)}, ${site.leadsToday} lead(s) aujourd'hui, ${site.leadsMonth} ce mois, ${site.leadsTotal} au total`),
    ...(data.vercelAvailable ? [] : ["(VERCEL_API_TOKEN absent : statuts des déploiements inconnus.)"]),
    "",
    "Prospection :",
    `- ${data.outreach.prospects} prospects en base, ${data.outreach.contacted} déjà contactés`,
    `- ${data.outreach.drafts} brouillon(s) en attente de validation`,
    `- ${data.outreach.sentToday} email(s) envoyé(s) et ${data.outreach.repliesToday} réponse(s) reçue(s) aujourd'hui`,
    "",
    REPORT_FOOTER,
  ].join("\n");
}
