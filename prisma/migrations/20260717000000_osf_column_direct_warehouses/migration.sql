-- Add optional direct ERP targeting to OSF columns (for warehouses that are not
-- their own Cosmo location, e.g. Cosmetics.lk shop warehouses). Additive only.
ALTER TABLE "OsfColumnConfig"
  ADD COLUMN IF NOT EXISTS "erpnextInstanceId" TEXT;

ALTER TABLE "OsfColumnConfig"
  ADD COLUMN IF NOT EXISTS "directWarehouses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
