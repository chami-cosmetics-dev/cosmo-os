CREATE TABLE IF NOT EXISTS "OrderWaybill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "courierName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderWaybill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderWaybill_companyId_waybillNo_key"
  ON "OrderWaybill"("companyId", "waybillNo");

CREATE INDEX IF NOT EXISTS "OrderWaybill_companyId_invoiceNumber_idx"
  ON "OrderWaybill"("companyId", "invoiceNumber");

CREATE INDEX IF NOT EXISTS "OrderWaybill_companyId_orderId_createdAt_idx"
  ON "OrderWaybill"("companyId", "orderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "OrderWaybill_companyId_createdAt_idx"
  ON "OrderWaybill"("companyId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderWaybill_companyId_fkey'
  ) THEN
    ALTER TABLE "OrderWaybill"
      ADD CONSTRAINT "OrderWaybill_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderWaybill_orderId_fkey'
  ) THEN
    ALTER TABLE "OrderWaybill"
      ADD CONSTRAINT "OrderWaybill_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
