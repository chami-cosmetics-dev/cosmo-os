ALTER TABLE "ContactMaster"
  ADD COLUMN IF NOT EXISTS "assignedMerchant" TEXT;

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_assignedMerchant_idx"
  ON "ContactMaster"("companyId", "assignedMerchant");
