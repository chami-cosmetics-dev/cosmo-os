-- Track Cosmo -> ERP book-note push status so admins can bulk-sync old sheets
-- and retry failures.

ALTER TABLE "BookNoteDay" ADD COLUMN "erpSyncedAt" TIMESTAMP(3),
ADD COLUMN "erpSyncFailedAt" TIMESTAMP(3),
ADD COLUMN "erpSyncError" TEXT;

CREATE INDEX "BookNoteDay_companyId_erpSyncedAt_idx" ON "BookNoteDay"("companyId", "erpSyncedAt");
CREATE INDEX "BookNoteDay_companyId_erpSyncFailedAt_idx" ON "BookNoteDay"("companyId", "erpSyncFailedAt");
