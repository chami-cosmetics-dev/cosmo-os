CREATE TYPE "MaterialTransferStatus" AS ENUM ('sent', 'received');

CREATE TABLE "MaterialTransfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "erpName" TEXT NOT NULL,
    "erpCompany" TEXT NOT NULL,
    "sourceWarehouse" TEXT NOT NULL,
    "targetWarehouse" TEXT NOT NULL,
    "status" "MaterialTransferStatus" NOT NULL DEFAULT 'sent',
    "createdByUserId" TEXT,
    "receivedByUserId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "barcode" TEXT NOT NULL DEFAULT '',
    "uom" TEXT NOT NULL DEFAULT 'Nos',
    "sentQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialTransferLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialTransfer_companyId_slot_erpName_key" ON "MaterialTransfer"("companyId", "slot", "erpName");
CREATE INDEX "MaterialTransfer_companyId_createdAt_idx" ON "MaterialTransfer"("companyId", "createdAt" DESC);
CREATE INDEX "MaterialTransfer_companyId_targetWarehouse_status_idx" ON "MaterialTransfer"("companyId", "targetWarehouse", "status");
CREATE INDEX "MaterialTransferLine_transferId_idx" ON "MaterialTransferLine"("transferId");

ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialTransferLine" ADD CONSTRAINT "MaterialTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "MaterialTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
