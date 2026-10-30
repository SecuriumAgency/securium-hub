-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NOUVEAU', 'ICEBREAKER_GENERE', 'EMAIL_1_ENVOYE', 'RELANCE_1', 'REPONDU', 'REFUS');

-- AlterTable
ALTER TABLE "OutreachProspect" ADD COLUMN     "emailOpenedAt" TIMESTAMP(3),
ADD COLUMN     "linkClickedAt" TIMESTAMP(3),
ADD COLUMN     "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'NOUVEAU';

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "step" INTEGER NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSequence_leadId_sentAt_idx" ON "EmailSequence"("leadId", "sentAt");

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "OutreachProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prospects déjà démarchés : ils entrent au Kanban dans la colonne de leur dernier statut du registre.
UPDATE "OutreachProspect" SET "pipelineStatus" = 'EMAIL_1_ENVOYE' WHERE "status" = 'Envoye';
UPDATE "OutreachProspect" SET "pipelineStatus" = 'RELANCE_1' WHERE "status" = 'Relance_1';
