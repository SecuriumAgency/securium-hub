-- AlterTable
ALTER TABLE "CapturedLead" ADD COLUMN     "source" TEXT,
ADD COLUMN     "projectIntent" TEXT,
ADD COLUMN     "isExclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soldCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxSales" INTEGER NOT NULL DEFAULT 3;
