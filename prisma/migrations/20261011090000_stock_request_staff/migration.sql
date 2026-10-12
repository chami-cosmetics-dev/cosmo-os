-- AlterTable
ALTER TABLE "StockRequest" ADD COLUMN     "awaitingStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "restockedWarehouse" TEXT,
ALTER COLUMN "shopifyStoreHandle" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StockRequest_companyId_source_createdById_createdAt_idx" ON "StockRequest"("companyId", "source", "createdById", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockRequest_source_awaitingStock_restockedAt_idx" ON "StockRequest"("source", "awaitingStock", "restockedAt");

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

