-- AlterTable
ALTER TABLE "Order" ADD COLUMN "erpnextSyncStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ErpSyncFailureEmailConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpSyncFailureEmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSyncFailureEmailSendLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subject" TEXT,
    "htmlBody" TEXT,
    "summaryJson" JSONB,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "errorSummary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSyncFailureEmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpSyncFailureEmailConfig_companyId_key" ON "ErpSyncFailureEmailConfig"("companyId");

-- CreateIndex
CREATE INDEX "ErpSyncFailureEmailSendLog_companyId_createdAt_idx" ON "ErpSyncFailureEmailSendLog"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ErpSyncFailureEmailSendLog_companyId_reportDate_status_idx" ON "ErpSyncFailureEmailSendLog"("companyId", "reportDate", "status");

-- AddForeignKey
ALTER TABLE "ErpSyncFailureEmailConfig" ADD CONSTRAINT "ErpSyncFailureEmailConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSyncFailureEmailSendLog" ADD CONSTRAINT "ErpSyncFailureEmailSendLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
