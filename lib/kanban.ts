// Kanban de prospection de /admin/outreach. Un fichier "use server" n'exporte que des fonctions async :
// les colonnes, partagées par les Server Actions et le composant client, vivent ici.
import { PipelineStatus } from "./generated/prisma/enums";

// Dans l'ordre du parcours d'un prospect.
export const PIPELINE_COLUMNS: { status: PipelineStatus; label: string }[] = [
  { status: PipelineStatus.NOUVEAU, label: "Nouveau" },
  { status: PipelineStatus.ICEBREAKER_GENERE, label: "Icebreaker Généré" },
  { status: PipelineStatus.EMAIL_1_ENVOYE, label: "Email 1 Envoyé" },
  { status: PipelineStatus.RELANCE_1, label: "Relance 1" },
  { status: PipelineStatus.REPONDU, label: "Répondu" },
  { status: PipelineStatus.REFUS, label: "Refus" },
];

// Comme le tableau des prospects de la page.
export const MAX_KANBAN_LEADS = 1000;

// Le statut reçu par une Server Action vient du navigateur : null s'il n'est pas une colonne du Kanban.
export function parsePipelineStatus(value: string) {
  return PIPELINE_COLUMNS.find((column) => column.status === value)?.status ?? null;
}
