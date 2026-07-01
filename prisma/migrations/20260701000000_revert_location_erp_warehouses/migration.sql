-- Restore erpnextWarehouse column on CompanyLocation
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "erpnextWarehouse" TEXT;

-- Restore data from CompanyLocationWarehouse (default warehouse per location)
-- Conditional: CompanyLocationWarehouse may not exist on databases that never ran the intermediate migration
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CompanyLocationWarehouse'
  ) THEN
    UPDATE "CompanyLocation" cl
    SET "erpnextWarehouse" = w."warehouse"
    FROM "CompanyLocationWarehouse" w
    WHERE w."companyLocationId" = cl."id" AND w."isDefault" = true;
  END IF;
END $$;

-- Drop CompanyLocationWarehouse table
DROP TABLE IF EXISTS "CompanyLocationWarehouse";
