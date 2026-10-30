"use server";

import { revalidatePath } from "next/cache";
import { hasAdminSession } from "@/lib/admin-session";
import { MAX_KANBAN_LEADS, parsePipelineStatus } from "@/lib/kanban";
import { prisma } from "@/lib/prisma";

// Identifiant cuid : rien d'autre n'atteint la base.
const LEAD_ID = /^[a-z0-9]{1,40}$/;

export type KanbanLead = Awaited<ReturnType<typeof getKanbanLeads>>[number];
export type UpdateLeadStatusResult = { ok: true } | { ok: false; error: string };

// Prospects du Kanban, du premier contact le plus récent au plus ancien, avec le journal de leurs envois.
// Une Server Action s'appelle aussi depuis le navigateur : session revérifiée, et champs listés un à un
// (le corps des emails, inutile aux cartes, ne part pas dans la page).
export async function getKanbanLeads() {
  if (!(await hasAdminSession())) throw new Error("Session admin requise.");
  return prisma.outreachProspect.findMany({
    select: {
      id: true,
      company: true,
      email: true,
      pipelineStatus: true,
      createdAt: true,
      emailSequences: { select: { id: true, subject: true, sentAt: true, step: true }, orderBy: { sentAt: "desc" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_KANBAN_LEADS,
  });
}

// Déplace un prospect dans le Kanban. `status` (registre, agent Chasseur) n'est pas touché.
export async function updateLeadStatus(id: string, newStatus: string): Promise<UpdateLeadStatusResult> {
  if (!(await hasAdminSession())) return { ok: false, error: "Session admin requise." };
  const pipelineStatus = parsePipelineStatus(newStatus);
  if (!LEAD_ID.test(id) || !pipelineStatus) return { ok: false, error: "Prospect ou statut invalide." };

  try {
    const { count } = await prisma.outreachProspect.updateMany({ where: { id }, data: { pipelineStatus } });
    if (count === 0) return { ok: false, error: "Prospect introuvable : il a peut-être été purgé." };
  } catch (error) {
    console.error("[kanban] mise à jour du statut impossible :", error);
    return { ok: false, error: "Mise à jour du statut impossible." };
  }
  revalidatePath("/admin/outreach");
  return { ok: true };
}
