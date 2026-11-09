import { agencyOrganization } from "@/lib/seo/organization";

// Données structurées Schema.org (JSON-LD) de l'agence, lues par les moteurs de recherche.
// Rendu côté serveur, sans JavaScript côté client. Le « < » est échappé pour qu'aucune donnée
// ne puisse fermer la balise <script> prématurément.
export function OrganizationJsonLd() {
  const json = JSON.stringify(agencyOrganization).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
