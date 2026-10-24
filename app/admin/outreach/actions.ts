"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SENT_STATUS } from "@/lib/chasseur";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "@/lib/session";

// Validation des brouillons de l'agent Chasseur, depuis /admin/outreach.
// Le middleware exige déjà la session sur cette page ; une action serveur reste un point d'entrée
// POST à part entière, d'où la vérification ici aussi.
async function requireSession() {
  const secret = sessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret || !(await verifySessionToken(token, secret))) throw new Error("Session admin requise.");
}

function draftId(formData: FormData) {
  const id = formData.get("draftId");
  if (typeof id !== "string" || !id) throw new Error("Brouillon introuvable.");
  return id;
}

// L'email vient de partir : le prospect passe à « Envoye », daté de maintenant, et le brouillon disparaît.
export async function markDraftSent(formData: FormData) {
  await requireSession();
  const id = draftId(formData);
  await prisma.$transaction(async (tx) => {
    const draft = await tx.outreachDraft.delete({ where: { id } });
    await tx.outreachProspect.update({
      where: { id: draft.prospectId },
      data: { status: SENT_STATUS, lastContactAt: new Date() },
    });
  });
  revalidatePath("/admin/outreach");
}

// Brouillon refusé : le prospect retrouve son statut d'avant, rien n'est parti.
export async function rejectDraft(formData: FormData) {
  await requireSession();
  const id = draftId(formData);
  await prisma.$transaction(async (tx) => {
    const draft = await tx.outreachDraft.delete({ where: { id } });
    await tx.outreachProspect.update({ where: { id: draft.prospectId }, data: { status: draft.previousStatus } });
  });
  revalidatePath("/admin/outreach");
}
