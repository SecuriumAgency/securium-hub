import { normalizeNicheList, normalizeZoneList } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

// Partenaires acheteurs du broker : identité et ciblage (niches et zones). Enregistrés par scripts/broker/.
// Un partenaire est actif dès qu'il a au moins une niche et une zone : c'est le critère du matching.

export type PartnerProfile = {
  company: string;
  email: string;
  city: string;
  activity: string;
  niches: string[];
  zones: string[];
};

export const GEO_ENERGY_HABITAT: PartnerProfile = {
  company: "Geo Energy Habitat",
  // Contact public du site (geoenergyhabitat/lib/site.ts). Clé d'identité : l'email est unique.
  email: "contact@geoenergyhabitat.com",
  city: "Chilly-Mazarin",
  activity: "Rénovation énergétique",
  niches: ["Isolation", "Pompe à Chaleur", "Rénovation Énergétique", "Audit Énergétique"],
  // Île-de-France : Paris et les sept départements de la zone d'intervention.
  zones: ["75", "77", "78", "91", "92", "93", "94", "95"],
};

/** Crée ou met à jour le partenaire, sans doublon (clé : email). Idempotent. */
export async function registerPartner(partner: PartnerProfile) {
  const targetNiches = normalizeNicheList(partner.niches);
  const targetZipCodes = normalizeZoneList(partner.zones);
  const now = new Date();

  return prisma.outreachProspect.upsert({
    where: { email: partner.email },
    create: {
      company: partner.company,
      email: partner.email,
      city: partner.city,
      activity: partner.activity,
      status: "Partenaire actif",
      pipelineStatus: "REPONDU",
      source: "hub-partenaire",
      createdAt: now,
      lastContactAt: now,
      targetNiches,
      targetZipCodes,
    },
    update: {
      company: partner.company,
      city: partner.city,
      activity: partner.activity,
      status: "Partenaire actif",
      targetNiches,
      targetZipCodes,
    },
    select: { id: true, company: true, status: true, targetNiches: true, targetZipCodes: true },
  });
}
