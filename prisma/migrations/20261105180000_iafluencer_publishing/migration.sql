-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rushName" TEXT,
    "niche" TEXT,
    "mediaUrl" TEXT,
    "mediaPrompt" TEXT,
    "caption" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IAfluencerSettings" (
    "id" TEXT NOT NULL,
    "artDirection" TEXT NOT NULL DEFAULT '',
    "brandVoice" TEXT NOT NULL DEFAULT '',
    "autopilotStories" BOOLEAN NOT NULL DEFAULT false,
    "autopilotReels" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IAfluencerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_status_scheduledAt_idx" ON "SocialPost"("status", "scheduledAt");
