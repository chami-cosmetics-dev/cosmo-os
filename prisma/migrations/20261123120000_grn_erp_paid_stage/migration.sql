ALTER TABLE "GrnPaymentApproval"
  ALTER COLUMN "approvedAt" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "paymentEntryName" TEXT;
