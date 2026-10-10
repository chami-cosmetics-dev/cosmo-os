-- Live ERP Item Manufacturing tax status, written when the Item webhook fires.
ALTER TABLE "ProductItem" ADD COLUMN "erp1TaxStatus" TEXT;
ALTER TABLE "ProductItem" ADD COLUMN "erp2TaxStatus" TEXT;
