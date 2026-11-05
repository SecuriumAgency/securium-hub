import { GEO_ENERGY_HABITAT, registerPartner } from "@/lib/broker/partners";
import { prisma } from "@/lib/prisma";

// Enregistre (ou met à jour) le partenaire Geo Energy Habitat dans le broker.
// Usage : npx tsx --env-file=.env scripts/broker/register-geo-energy.ts
registerPartner(GEO_ENERGY_HABITAT)
  .then((row) => console.log(JSON.stringify(row, null, 2)))
  .catch((error) => {
    console.error("erreur:", error instanceof Error ? error.message : "inconnue");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
