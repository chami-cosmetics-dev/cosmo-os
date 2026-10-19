-- First purchased date for Contact Master export. Filled by purchase-summary refresh, not during CSV download.
ALTER TABLE "ContactMaster"
  ADD COLUMN IF NOT EXISTS "purchaseFirstOrderAt" TIMESTAMP(3);

-- Export used to take the latest non-allocation update per contact with no contactId index.
CREATE INDEX IF NOT EXISTS "ContactAllocationUpdate_contactId_createdAt_idx"
  ON "ContactAllocationUpdate" ("contactId", "createdAt" DESC);
