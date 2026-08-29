ALTER TABLE "StoreStockCountReportItem" ADD COLUMN "qbStock" INTEGER;

CREATE INDEX "StoreStockCountReportItem_reportId_qbStock_idx" ON "StoreStockCountReportItem"("reportId", "qbStock");
