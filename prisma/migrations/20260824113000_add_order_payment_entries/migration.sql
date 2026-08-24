-- ERP Payment Entry allocations stored per invoice/order.
CREATE TABLE "OrderPaymentEntry" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentEntryId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "modeOfPayment" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPaymentEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderPaymentEntry_orderId_paymentEntryId_key"
ON "OrderPaymentEntry"("orderId", "paymentEntryId");

CREATE INDEX "OrderPaymentEntry_paymentEntryId_idx"
ON "OrderPaymentEntry"("paymentEntryId");

CREATE INDEX "OrderPaymentEntry_orderId_postingDate_idx"
ON "OrderPaymentEntry"("orderId", "postingDate");

ALTER TABLE "OrderPaymentEntry"
ADD CONSTRAINT "OrderPaymentEntry_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
