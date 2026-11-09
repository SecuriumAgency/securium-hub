// Réparations automatiques autorisées : un site, un seul workflow GitHub Actions. Le navigateur n'envoie que
// l'identifiant du site ; le workflow est choisi ici, côté serveur, jamais depuis la requête.
export type RepairTarget = { siteId: string; workflowId: string; label: string };

const REPAIRS: RepairTarget[] = [
  { siteId: "geoenergy-habitat", workflowId: "geo-lighthouse", label: "Lighthouse CI · GeoEnergy Habitat" },
  { siteId: "elite-depannage-34", workflowId: "elite-lighthouse", label: "Lighthouse CI · Elite Dépannage" },
];

export function repairFor(siteId: string): RepairTarget | null {
  return REPAIRS.find((target) => target.siteId === siteId) ?? null;
}
