// Métriques live de l'écosystème, servies par GET /api/ecosystem/metrics (session admin) et lues par le store.
export type TaskSeverity = "info" | "warning" | "critical";

export type EcosystemMetrics = {
  generatedAt: string;
  // Minuit, heure de Paris : bornes des compteurs « aujourd'hui » et « ce mois ».
  dayStart: string;
  monthStart: string;
  // Leads reçus par les sites de la flotte (table Lead), au total et par site.
  leads: {
    today: number;
    month: number;
    todayBySite: Record<string, number>;
    monthBySite: Record<string, number>;
  };
  // Leads B2C captés par le tunnel public et vendus au broker (table CapturedLead).
  capturedLeads: { today: number };
  // Tâches de l'Orchestrateur encore ouvertes (table AgentTask, statut PENDING).
  tasks: { pending: number; bySeverity: Record<TaskSeverity, number> };
  // Trafic GA4 du dernier jour reçu du rapport quotidien, par site. null tant qu'aucun rapport n'est arrivé.
  traffic: { date: string; bySite: Record<string, SiteTrafficCounts> } | null;
};

export type SiteTrafficCounts = { sessions: number; users: number; pageviews: number };

export type MetricRow = { label: string; value: number };

// Lignes affichées dans le HUD selon le bâtiment sélectionné. Un module sans donnée associée n'a pas de ligne.
export function metricRows(id: string, isSite: boolean, metrics: EcosystemMetrics): MetricRow[] {
  if (isSite) {
    const rows: MetricRow[] = [
      { label: "Leads aujourd'hui", value: metrics.leads.todayBySite[id] ?? 0 },
      { label: "Leads ce mois", value: metrics.leads.monthBySite[id] ?? 0 },
    ];
    const traffic = metrics.traffic?.bySite[id];
    if (metrics.traffic && traffic) {
      rows.push(
        { label: `Utilisateurs (${metrics.traffic.date})`, value: traffic.users },
        { label: `Pages vues (${metrics.traffic.date})`, value: traffic.pageviews },
      );
    }
    return rows;
  }
  switch (id) {
    case "parc-sites":
      return [
        { label: "Leads aujourd'hui (sites)", value: metrics.leads.today },
        { label: "Leads ce mois (sites)", value: metrics.leads.month },
      ];
    case "lead-broker":
    case "matchmaker":
      return [{ label: "Leads captés aujourd'hui", value: metrics.capturedLeads.today }];
    case "securium-os":
    case "escadron":
      return [
        { label: "Tâches en attente", value: metrics.tasks.pending },
        { label: "Dont critiques", value: metrics.tasks.bySeverity.critical },
        { label: "Dont avertissements", value: metrics.tasks.bySeverity.warning },
      ];
    default:
      return [];
  }
}
