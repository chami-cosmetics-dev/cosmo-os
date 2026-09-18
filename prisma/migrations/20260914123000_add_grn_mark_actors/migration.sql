-- Add actor tracking for GRN stage marks.
ALTER TABLE "GrnPurchaseReceipt"
  ADD COLUMN "handoverById" TEXT,
  ADD COLUMN "valuedById" TEXT,
  ADD COLUMN "receivedById" TEXT;

CREATE INDEX "GrnPurchaseReceipt_handoverById_idx"
  ON "GrnPurchaseReceipt"("handoverById");

CREATE INDEX "GrnPurchaseReceipt_valuedById_idx"
  ON "GrnPurchaseReceipt"("valuedById");

CREATE INDEX "GrnPurchaseReceipt_receivedById_idx"
  ON "GrnPurchaseReceipt"("receivedById");

ALTER TABLE "GrnPurchaseReceipt"
  ADD CONSTRAINT "GrnPurchaseReceipt_handoverById_fkey"
  FOREIGN KEY ("handoverById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "GrnPurchaseReceipt"
  ADD CONSTRAINT "GrnPurchaseReceipt_valuedById_fkey"
  FOREIGN KEY ("valuedById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "GrnPurchaseReceipt"
  ADD CONSTRAINT "GrnPurchaseReceipt_receivedById_fkey"
  FOREIGN KEY ("receivedById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Add daily pending GRN email configuration and audit logs.
CREATE TABLE "GrnPendingEmailConfig" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "recipients" JSONB NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrnPendingEmailConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnPendingEmailSendLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reportDate" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "subject" TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "recipients" JSONB NOT NULL DEFAULT '[]',
  "errorSummary" TEXT,
  "source" TEXT NOT NULL DEFAULT 'cron',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GrnPendingEmailSendLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnPendingEmailConfig_companyId_key"
  ON "GrnPendingEmailConfig"("companyId");

CREATE INDEX "GrnPendingEmailSendLog_companyId_createdAt_idx"
  ON "GrnPendingEmailSendLog"("companyId", "createdAt" DESC);

CREATE INDEX "GrnPendingEmailSendLog_companyId_reportDate_status_idx"
  ON "GrnPendingEmailSendLog"("companyId", "reportDate", "status");

ALTER TABLE "GrnPendingEmailConfig"
  ADD CONSTRAINT "GrnPendingEmailConfig_companyId_fkey"
  FOREIGN KEY ("companyId")
  REFERENCES "Company"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "GrnPendingEmailSendLog"
  ADD CONSTRAINT "GrnPendingEmailSendLog_companyId_fkey"
  FOREIGN KEY ("companyId")
  REFERENCES "Company"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
