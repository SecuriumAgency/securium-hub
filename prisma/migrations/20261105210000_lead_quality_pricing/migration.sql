-- CreateEnum
CREATE TYPE "LeadQuality" AS ENUM ('FAIBLE', 'MOYEN', 'FORT');

-- AlterTable
ALTER TABLE "CapturedLead" ADD COLUMN     "quality" "LeadQuality" NOT NULL DEFAULT 'MOYEN',
ADD COLUMN     "suggestedPrice" DOUBLE PRECISION;
