ALTER TABLE "ProductOsfProfile"
  ADD COLUMN "highRiskOrderPlaced" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "highRiskOrderQty" INTEGER,
  ADD COLUMN "highRiskSupplier" TEXT,
  ADD COLUMN "highRiskReceiveDate" DATE,
  ADD COLUMN "highRiskReason" TEXT;

CREATE TABLE "HighRiskReorderRecord" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "cycleStart" DATE NOT NULL,
  "sku" TEXT NOT NULL,
  "totalRop" INTEGER NOT NULL,
  "totalStock" DOUBLE PRECISION NOT NULL,
  "reorderQty" INTEGER NOT NULL,
  "bestPrice" DECIMAL(12,2),
  "bestSupplier" TEXT,
  "orderPlaced" BOOLEAN NOT NULL DEFAULT false,
  "orderQty" INTEGER,
  "orderSupplier" TEXT,
  "orderReceiveDate" DATE,
  "reasonType" TEXT,
  "replacementSku" TEXT,
  "changedPriority" TEXT,
  "otherReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fulfilledAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "HighRiskReorderRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HighRiskReorderRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HighRiskReorderRecord_companyId_cycleStart_status_idx" ON "HighRiskReorderRecord"("companyId", "cycleStart", "status");
CREATE INDEX "HighRiskReorderRecord_companyId_sku_createdAt_idx" ON "HighRiskReorderRecord"("companyId", "sku", "createdAt");
