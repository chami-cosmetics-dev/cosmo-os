-- Allow multiple call-queue assignment history rows per contact.
-- At most one pending row is enforced in application code.

DROP INDEX IF EXISTS "ContactInsightCallQueue_companyId_contactId_key";

ALTER TABLE "ContactInsightCallQueue"
  ADD COLUMN IF NOT EXISTS "lifetimeTotalAtAssign" DECIMAL(14, 2);

CREATE INDEX IF NOT EXISTS "ContactInsightCallQueue_companyId_contactId_status_idx"
  ON "ContactInsightCallQueue"("companyId", "contactId", "status");
