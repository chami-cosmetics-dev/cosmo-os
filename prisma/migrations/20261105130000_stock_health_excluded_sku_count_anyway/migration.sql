-- Exceptions to prefix rules: a SKU a rule (e.g. BU0*) matches that is still counted.
ALTER TABLE "StockHealthExcludedSku" ADD COLUMN "countAnyway" BOOLEAN NOT NULL DEFAULT false;
