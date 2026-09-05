ALTER TABLE "Order"
ADD COLUMN "erpPeSyncAutoRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "erpPeSyncLastAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "erpPeSyncNextAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "erpPeSyncRetryLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "Order_companyId_erpPeSyncNextAutoRetryAt_idx"
ON "Order"("companyId", "erpPeSyncNextAutoRetryAt");
