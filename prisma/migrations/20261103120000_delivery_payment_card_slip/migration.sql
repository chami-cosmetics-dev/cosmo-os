-- Card-on-delivery proof: last 4 digits + payment slip photo URL.
ALTER TABLE "DeliveryPayment" ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;
ALTER TABLE "DeliveryPayment" ADD COLUMN IF NOT EXISTS "cardSlipImageUrl" TEXT;
