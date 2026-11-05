-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NOUVEAU',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "urgency" TEXT,
ADD COLUMN     "message" TEXT;
