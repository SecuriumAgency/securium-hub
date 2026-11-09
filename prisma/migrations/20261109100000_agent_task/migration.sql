-- CreateEnum
CREATE TYPE "AgentTaskType" AS ENUM ('SEO', 'DEV', 'SECURITE', 'UI');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "AgentSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "type" "AgentTaskType" NOT NULL,
    "severity" "AgentSeverity" NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "assignedAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTask_status_createdAt_idx" ON "AgentTask"("status", "createdAt");

