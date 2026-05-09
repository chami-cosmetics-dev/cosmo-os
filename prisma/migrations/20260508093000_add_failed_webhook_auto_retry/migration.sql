ALTER TABLE "FailedOrderWebhook"
ADD COLUMN "autoRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "nextAutoRetryAt" TIMESTAMP(3),
ADD COLUMN "retryLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "FailedOrderWebhook_companyId_resolvedAt_nextAutoRetryAt_idx"
ON "FailedOrderWebhook"("companyId", "resolvedAt", "nextAutoRetryAt");
