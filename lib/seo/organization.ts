// Fiche de l'agence pour les données structurées (Schema.org Organization).
// Seuls des faits publics et vérifiés figurent ici : nom, adresse du site vitrine et logo.
// Aucune adresse postale ni numéro de téléphone n'est inventé : les ajouter ici seulement après vérification.
export const agencyOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Securium Agency",
  url: "https://www.securium-agency.fr",
  logo: "https://www.securium-agency.fr/logo/securium-logo.png",
} as const;
