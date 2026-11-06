import { z } from "zod";
import { canonicalNiche } from "@/lib/broker/matching";
import { calculateSuggestedPrice } from "@/lib/broker/pricingEngine";
import { prisma } from "@/lib/prisma";
import { departmentOf } from "@/lib/warm-call";

// Leads envoyés par le module d'acquisition (Chasseur). Ces personnes n'ont pas accepté la cession de leurs
// données : le lead est enregistré avec consentToShare = false, donc il ne peut pas être vendu tant que le
// consentement n'a pas été recueilli (règle du Lead Broker, RGPD).

const PHONE = /^(?:\+33|0)[1-9]\d{8}$/;
const ZIP = /^\d{5}$/;
const NAME = /^[A-Za-zÀ-ÿ' -]{1,60}$/;

export const IngestLeadSchema = z.object({
  firstName: z.string().trim().regex(NAME, "Prénom invalide."),
  lastName: z.string().trim().regex(NAME, "Nom invalide."),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(PHONE, "Téléphone français invalide.")),
  email: z.string().trim().toLowerCase().max(254).email("Email invalide.").nullable().optional(),
  zipCode: z.string().trim().regex(ZIP, "Code postal à 5 chiffres attendu."),
  niche: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .refine((value) => canonicalNiche(value).length >= 2, "Niche invalide."),
  source: z.string().trim().min(1).max(60),
});

export type IngestLead = z.infer<typeof IngestLeadSchema>;

export function parseIngest(payload: unknown) {
  return IngestLeadSchema.safeParse(payload);
}

export type IngestResult = { id: string; created: boolean };

/** Crée le lead, ou renvoie l'existant si ce téléphone est déjà connu. La niche et la zone sont normalisées pour le matching. */
export async function ingestLead(input: IngestLead): Promise<IngestResult> {
  const existing = await prisma.capturedLead.findFirst({ where: { phone: input.phone }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };

  const niche = canonicalNiche(input.niche);
  const quality = "MOYEN" as const;
  const lead = await prisma.capturedLead.create({
    data: {
      name: `${input.firstName} ${input.lastName}`.replace(/\s+/g, " ").trim(),
      phone: input.phone,
      email: input.email ?? null,
      niche,
      region: departmentOf(input.zipCode),
      postalCode: input.zipCode,
      consentToShare: false,
      source: input.source,
      quality,
      suggestedPrice: calculateSuggestedPrice(quality, niche),
    },
    select: { id: true },
  });
  return { id: lead.id, created: true };
}
