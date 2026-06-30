-- Repair: 20260625120000 was marked applied but columns may be missing (e.g. resolve --applied without deploy).
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "erpPeSyncError" TEXT,
  ADD COLUMN IF NOT EXISTS "erpPeSyncFailedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "erpPeSyncMop" TEXT;

CREATE INDEX IF NOT EXISTS "Order_companyId_erpPeSyncFailedAt_idx"
  ON "Order" ("companyId", "erpPeSyncFailedAt" DESC);
