import { z } from "zod";
import { NICHE_PATTERN, REGION_PATTERN } from "./public-leads-rules";

// Validation serveur du tunnel /devis. Ce module n'est importé que par l'API : zod reste hors du bundle
// du navigateur, qui n'a besoin que des règles partagées (lib/public-leads-rules.ts).

/** Téléphone français, espaces et séparateurs retirés. */
const PHONE_PATTERN = /^(?:\+33|0)[1-9]\d{8}$/;

export const PublicLeadSchema = z.object({
  niche: z.string().regex(NICHE_PATTERN).max(40),
  region: z.string().regex(REGION_PATTERN).nullable(),
  urgency: z.enum(["immediat", "3_mois", "6_mois"]),
  message: z.string().trim().max(500).optional(),
  // Accord facultatif à la cession des coordonnées à des artisans partenaires. Sans lui, le lead n'est jamais vendu.
  shareConsent: z.boolean().optional(),
  postalCode: z.string().regex(/^\d{5}$/, "Code postal à 5 chiffres."),
  name: z.string().trim().min(2, "Nom trop court.").max(80),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(PHONE_PATTERN, "Téléphone français attendu.")),
  email: z.union([z.email("Adresse e-mail invalide.").max(120), z.literal("")]).optional(),
  consent: z.literal(true, { error: "Le consentement est requis." }),
});

export type PublicLead = z.infer<typeof PublicLeadSchema>;
