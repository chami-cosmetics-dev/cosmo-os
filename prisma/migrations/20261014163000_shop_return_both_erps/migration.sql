-- Shop returns can post VAT lines to ERP1 and other lines to ERP2.
ALTER TABLE "MaterialTransfer" ADD COLUMN "erp2Name" TEXT;
ALTER TABLE "MaterialTransfer" ADD COLUMN "erpCompany2" TEXT;
ALTER TABLE "MaterialTransfer" ADD COLUMN "sourceWarehouse2" TEXT;
ALTER TABLE "MaterialTransfer" ADD COLUMN "targetWarehouse2" TEXT;
ALTER TABLE "MaterialTransferLine" ADD COLUMN "postSlot" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "MaterialTransfer_companyId_erp2Name_key" ON "MaterialTransfer"("companyId", "erp2Name");
