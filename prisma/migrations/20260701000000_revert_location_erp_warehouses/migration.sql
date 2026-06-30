-- Restore erpnextWarehouse column on CompanyLocation
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "erpnextWarehouse" TEXT;

-- Restore data from CompanyLocationWarehouse (default warehouse per location)
UPDATE "CompanyLocation" cl
SET "erpnextWarehouse" = w."warehouse"
FROM "CompanyLocationWarehouse" w
WHERE w."companyLocationId" = cl."id" AND w."isDefault" = true;

-- Drop CompanyLocationWarehouse table
DROP TABLE IF EXISTS "CompanyLocationWarehouse";
