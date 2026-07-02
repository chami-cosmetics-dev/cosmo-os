ALTER TABLE "ContactMaster"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "zone" TEXT,
  ADD COLUMN IF NOT EXISTS "area" TEXT,
  ADD COLUMN IF NOT EXISTS "exWebCustomer" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "exOffCustomer" BOOLEAN;

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_source_idx"
  ON "ContactMaster"("companyId", "source");

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_country_idx"
  ON "ContactMaster"("companyId", "country");

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_zone_idx"
  ON "ContactMaster"("companyId", "zone");

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_area_idx"
  ON "ContactMaster"("companyId", "area");
