-- Repair databases where the original payment-approval migration was recorded
-- as applied but its nullable payment-tracking columns were not created.
ALTER TABLE "GrnPaymentApproval"
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

ALTER TABLE "GrnPaymentApproval"
  ADD COLUMN IF NOT EXISTS "paidById" TEXT;
