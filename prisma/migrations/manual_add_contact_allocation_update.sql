-- ContactAllocationUpdate table
-- Tracks each time a merchant clicks the Update button in the customer allocation
-- panel. Used for the Call Center Performance Analysis chart on the dashboard,
-- which shows per-merchant update counts broken down by the contact's category.

CREATE TABLE IF NOT EXISTS "ContactAllocationUpdate" (
  "id"           TEXT         NOT NULL,
  "companyId"    TEXT         NOT NULL,
  "contactId"    TEXT         NOT NULL,
  "merchantId"   TEXT,
  -- Denormalized so chart data survives user account deletion
  "merchantName" TEXT,
  -- Contact's effective category at time of update
  "category"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactAllocationUpdate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContactAllocationUpdate"
  ADD CONSTRAINT "ContactAllocationUpdate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactAllocationUpdate"
  ADD CONSTRAINT "ContactAllocationUpdate_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactAllocationUpdate"
  ADD CONSTRAINT "ContactAllocationUpdate_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ContactAllocationUpdate_companyId_createdAt_idx"
  ON "ContactAllocationUpdate"("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ContactAllocationUpdate_companyId_merchantId_createdAt_idx"
  ON "ContactAllocationUpdate"("companyId", "merchantId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ContactAllocationUpdate_companyId_category_createdAt_idx"
  ON "ContactAllocationUpdate"("companyId", "category", "createdAt" DESC);
