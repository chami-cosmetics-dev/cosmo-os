-- CreateTable
CREATE TABLE "DailySalesSmsConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySalesSmsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySalesSmsSendLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "messageBody" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "errorSummary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySalesSmsSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySalesSmsConfig_companyId_key" ON "DailySalesSmsConfig"("companyId");

-- CreateIndex
CREATE INDEX "DailySalesSmsSendLog_companyId_createdAt_idx" ON "DailySalesSmsSendLog"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DailySalesSmsSendLog_companyId_reportDate_status_idx" ON "DailySalesSmsSendLog"("companyId", "reportDate", "status");

-- AddForeignKey
ALTER TABLE "DailySalesSmsConfig" ADD CONSTRAINT "DailySalesSmsConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySalesSmsSendLog" ADD CONSTRAINT "DailySalesSmsSendLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
