-- AlterTable
ALTER TABLE "OutreachProspect" ADD COLUMN     "partnershipType" TEXT NOT NULL DEFAULT 'CPL';

-- AlterTable
ALTER TABLE "CapturedLead" ADD COLUMN     "dealStatus" TEXT,
ADD COLUMN     "expectedCommission" DOUBLE PRECISION;
