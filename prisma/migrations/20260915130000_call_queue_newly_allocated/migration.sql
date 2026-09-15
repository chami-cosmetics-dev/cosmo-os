-- Newly-allocated badge for call-queue rows (cross-merchant import / reassignment).
ALTER TABLE "ContactInsightCallQueue"
ADD COLUMN IF NOT EXISTS "newlyAllocated" BOOLEAN NOT NULL DEFAULT false;
