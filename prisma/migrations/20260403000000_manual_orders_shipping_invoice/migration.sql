-- Manual orders: location invoice sequence, shipping charge options, line discount %

ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "manualInvoicePrefix" TEXT;
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "manualInvoiceNextSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "manualInvoiceSeqPadding" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS "ShippingChargeOption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingChargeOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShippingChargeOption_companyLocationId_label_key" ON "ShippingChargeOption"("companyLocationId", "label");
CREATE INDEX IF NOT EXISTS "ShippingChargeOption_companyId_companyLocationId_idx" ON "ShippingChargeOption"("companyId", "companyLocationId");

ALTER TABLE "ShippingChargeOption" ADD CONSTRAINT "ShippingChargeOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShippingChargeOption" ADD CONSTRAINT "ShippingChargeOption_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderLineItem" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2);
