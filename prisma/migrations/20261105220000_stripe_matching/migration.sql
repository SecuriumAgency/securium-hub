-- AlterTable
ALTER TABLE "OutreachProspect" ADD COLUMN     "targetNiches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetZipCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CapturedLead" ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CapturedLead_stripeSessionId_key" ON "CapturedLead"("stripeSessionId");
