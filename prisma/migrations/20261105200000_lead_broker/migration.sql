-- CreateEnum
CREATE TYPE "CapturedLeadStatus" AS ENUM ('AVAILABLE', 'SOLD', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadBatchStatus" AS ENUM ('PENDING_PAYMENT', 'PAID');

-- CreateTable
CREATE TABLE "CapturedLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "niche" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT,
    "urgency" TEXT,
    "message" TEXT,
    "consentToShare" BOOLEAN NOT NULL DEFAULT false,
    "status" "CapturedLeadStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price" DOUBLE PRECISION,
    "buyerId" TEXT,
    "batchId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapturedLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "status" "LeadBatchStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "buyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapturedLead_status_consentToShare_idx" ON "CapturedLead"("status", "consentToShare");

-- AddForeignKey
ALTER TABLE "CapturedLead" ADD CONSTRAINT "CapturedLead_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "OutreachProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturedLead" ADD CONSTRAINT "CapturedLead_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LeadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBatch" ADD CONSTRAINT "LeadBatch_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "OutreachProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
