CREATE TYPE "OrderExchangeReason" AS ENUM ('damaged_item', 'wrong_item', 'other');
CREATE TYPE "OrderExchangeStatus" AS ENUM ('pending', 'solved');

CREATE TABLE "OrderExchange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "originalOrderId" TEXT,
    "replacementOrderId" TEXT,
    "merchantUserId" TEXT,
    "originalReference" TEXT NOT NULL,
    "replacementReference" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "reason" "OrderExchangeReason" NOT NULL,
    "status" "OrderExchangeStatus" NOT NULL DEFAULT 'pending',
    "remark" TEXT,
    "actionDate" TIMESTAMP(3),
    "createdById" TEXT,
    "actionById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderExchange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderExchange_companyId_createdAt_idx" ON "OrderExchange"("companyId", "createdAt" DESC);
CREATE INDEX "OrderExchange_companyId_merchantUserId_status_createdAt_idx" ON "OrderExchange"("companyId", "merchantUserId", "status", "createdAt" DESC);
CREATE INDEX "OrderExchange_companyId_originalReference_idx" ON "OrderExchange"("companyId", "originalReference");
CREATE INDEX "OrderExchange_companyId_replacementReference_idx" ON "OrderExchange"("companyId", "replacementReference");

ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_replacementOrderId_fkey" FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_actionById_fkey" FOREIGN KEY ("actionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
