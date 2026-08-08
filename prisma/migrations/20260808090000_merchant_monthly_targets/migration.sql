-- CreateTable
CREATE TABLE "MerchantMonthlyTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantMonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantMonthlyTargetHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "action" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantMonthlyTargetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantMonthlyTarget_companyId_yearMonth_idx" ON "MerchantMonthlyTarget"("companyId", "yearMonth");

-- CreateIndex
CREATE INDEX "MerchantMonthlyTarget_userId_yearMonth_idx" ON "MerchantMonthlyTarget"("userId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMonthlyTarget_companyId_userId_yearMonth_key" ON "MerchantMonthlyTarget"("companyId", "userId", "yearMonth");

-- CreateIndex
CREATE INDEX "MerchantMonthlyTargetHistory_companyId_userId_yearMonth_createdAt_idx" ON "MerchantMonthlyTargetHistory"("companyId", "userId", "yearMonth", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MerchantMonthlyTargetHistory_companyId_yearMonth_idx" ON "MerchantMonthlyTargetHistory"("companyId", "yearMonth");

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTarget" ADD CONSTRAINT "MerchantMonthlyTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTarget" ADD CONSTRAINT "MerchantMonthlyTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTarget" ADD CONSTRAINT "MerchantMonthlyTarget_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTargetHistory" ADD CONSTRAINT "MerchantMonthlyTargetHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTargetHistory" ADD CONSTRAINT "MerchantMonthlyTargetHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMonthlyTargetHistory" ADD CONSTRAINT "MerchantMonthlyTargetHistory_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
