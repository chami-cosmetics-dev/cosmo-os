-- Shadow locations: allow one company location to source product inventory from another.

ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "shadowParentLocationId" TEXT;

CREATE INDEX IF NOT EXISTS "CompanyLocation_companyId_shadowParentLocationId_idx"
ON "CompanyLocation"("companyId", "shadowParentLocationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CompanyLocation_shadowParentLocationId_fkey'
  ) THEN
    ALTER TABLE "CompanyLocation"
    ADD CONSTRAINT "CompanyLocation_shadowParentLocationId_fkey"
    FOREIGN KEY ("shadowParentLocationId") REFERENCES "CompanyLocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
