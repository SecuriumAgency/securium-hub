"use server";

import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { normalizeNicheList, normalizeZoneList } from "@/lib/broker/matching";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const ID = /^[a-z0-9]{1,40}$/;
const TargetingSchema = z.object({
  id: z.string().regex(ID),
  niches: z.array(z.string().max(60)).max(20),
  zones: z.array(z.string().max(10)).max(50),
});

export type TargetingResult = { ok: true; niches: string[]; zones: string[] } | { ok: false; error: string };

// Ciblage B2B d'un prospect : niches et zones normalisées comme dans le Lead Broker. Appelée depuis le Closing.
export async function updateProspectTargeting(id: string, niches: string[], zones: string[]): Promise<TargetingResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };

  const parsed = TargetingSchema.safeParse({ id, niches, zones });
  if (!parsed.success) return { ok: false, error: "Ciblage invalide." };

  try {
    const row = await prisma.outreachProspect.update({
      where: { id: parsed.data.id },
      data: { targetNiches: normalizeNicheList(parsed.data.niches), targetZipCodes: normalizeZoneList(parsed.data.zones) },
      select: { targetNiches: true, targetZipCodes: true },
    });
    return { ok: true, niches: row.targetNiches, zones: row.targetZipCodes };
  } catch (error) {
    console.error("[outreach] ciblage impossible :", error instanceof Error ? error.message : "erreur inconnue");
    return { ok: false, error: "Enregistrement impossible." };
  }
}
