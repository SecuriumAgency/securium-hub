-- CreateTable
CREATE TABLE "OutreachBlocklist" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachBlocklist_pkey" PRIMARY KEY ("email")
);
