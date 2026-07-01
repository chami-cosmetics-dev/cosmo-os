-- Add missing ERP sync error tracking columns to Order
-- erpnextSyncError and erpnextSyncFailedAt were in the schema but had no migration
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "erpnextSyncError" TEXT,
  ADD COLUMN IF NOT EXISTS "erpnextSyncFailedAt" TIMESTAMP(3);
