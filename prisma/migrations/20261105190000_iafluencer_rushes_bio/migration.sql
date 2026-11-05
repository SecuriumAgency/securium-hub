-- AlterTable
ALTER TABLE "IAfluencerSettings" ADD COLUMN "bio" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Rush" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sizeMb" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rush_url_key" ON "Rush"("url");
