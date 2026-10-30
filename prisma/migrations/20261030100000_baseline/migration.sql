-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."AgentSettings" (
    "id" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "service" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutreachDraft" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutreachMessage" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutreachProspect" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastContactAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectionDraft" (
    "id" TEXT NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_siteId_createdAt_idx" ON "public"."Lead"("siteId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachDraft_prospectId_key" ON "public"."OutreachDraft"("prospectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_messageId_key" ON "public"."OutreachMessage"("messageId" ASC);

-- CreateIndex
CREATE INDEX "OutreachMessage_prospectId_createdAt_idx" ON "public"."OutreachMessage"("prospectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "OutreachProspect_createdAt_idx" ON "public"."OutreachProspect"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachProspect_email_key" ON "public"."OutreachProspect"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectionDraft_segmentKey_key" ON "public"."ProspectionDraft"("segmentKey" ASC);

-- CreateIndex
CREATE INDEX "ProspectionDraft_status_createdAt_idx" ON "public"."ProspectionDraft"("status" ASC, "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "public"."OutreachDraft" ADD CONSTRAINT "OutreachDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."OutreachProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutreachMessage" ADD CONSTRAINT "OutreachMessage_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."OutreachProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
