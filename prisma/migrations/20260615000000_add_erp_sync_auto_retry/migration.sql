ALTER TABLE "Order"
ADD COLUMN "erpnextSyncAutoRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "erpnextSyncLastAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "erpnextSyncNextAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "erpnextSyncRetryLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "Order_companyId_erpnextSyncNextAutoRetryAt_idx"
ON "Order"("companyId", "erpnextSyncNextAutoRetryAt");
