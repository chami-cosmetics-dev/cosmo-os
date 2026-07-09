-- Move order default print format selection to locations.
-- This is intentionally non-destructive: older databases may still have
-- Company.defaultOrderPrintFormatId, but Prisma no longer reads it.

ALTER TABLE "CompanyLocation"
  ADD COLUMN IF NOT EXISTS "defaultOrderPrintFormatId" TEXT;

DO $$
BEGIN
  ALTER TABLE "CompanyLocation"
    ADD CONSTRAINT "CompanyLocation_defaultOrderPrintFormatId_fkey"
    FOREIGN KEY ("defaultOrderPrintFormatId")
    REFERENCES "PrintFormat"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

