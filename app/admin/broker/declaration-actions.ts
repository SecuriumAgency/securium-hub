"use server";

import { hasAdminSession } from "@/lib/admin-session";
import { createDeclarationToken } from "@/lib/broker/declaration-token";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const ID = /^[a-z0-9]{1,40}$/;

export type DeclarationLinkResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Lien de déclaration d'un acheteur : il choisit lui-même ses métiers et ses zones. Le lien est renvoyé
 * à l'admin, qui le copie et l'envoie lui-même. Aucun envoi automatique, aucune écriture en base.
 */
export async function createDeclarationLink(buyerId: string): Promise<DeclarationLinkResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  if (!ID.test(buyerId)) return { ok: false, error: "Acheteur invalide." };

  const buyer = await prisma.outreachProspect.findUnique({ where: { id: buyerId }, select: { id: true } });
  if (!buyer) return { ok: false, error: "Acheteur introuvable." };

  const token = await createDeclarationToken(buyer.id);
  if (!token) return { ok: false, error: "SESSION_SECRET absent ou trop court : lien impossible." };
  return { ok: true, path: `/partenaire/${token}` };
}
