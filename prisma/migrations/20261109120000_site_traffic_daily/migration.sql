-- CreateTable
CREATE TABLE "SiteTrafficDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "users" INTEGER NOT NULL,
    "pageviews" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteTrafficDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteTrafficDaily_date_idx" ON "SiteTrafficDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTrafficDaily_date_siteId_key" ON "SiteTrafficDaily"("date", "siteId");

