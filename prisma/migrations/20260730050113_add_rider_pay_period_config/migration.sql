-- CreateTable
CREATE TABLE "RiderPayPeriodConfig" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "paydayDayOfMonth" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "RiderPayPeriodConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderPayPeriodConfig_singletonKey_key" ON "RiderPayPeriodConfig"("singletonKey");
