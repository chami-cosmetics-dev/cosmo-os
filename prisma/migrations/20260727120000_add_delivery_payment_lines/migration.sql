-- Split payment lines: multiple methods/amounts against one delivery payment / SI.
CREATE TABLE "DeliveryPaymentLine" (
    "id" TEXT NOT NULL,
    "deliveryPaymentId" TEXT NOT NULL,
    "paymentMethod" "DeliveryPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bankReference" TEXT,
    "cardReference" TEXT,
    "referenceNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "erpPaymentEntryName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPaymentLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryPaymentLine_deliveryPaymentId_sortOrder_idx" ON "DeliveryPaymentLine"("deliveryPaymentId", "sortOrder");

CREATE INDEX "DeliveryPaymentLine_paymentMethod_idx" ON "DeliveryPaymentLine"("paymentMethod");

ALTER TABLE "DeliveryPaymentLine" ADD CONSTRAINT "DeliveryPaymentLine_deliveryPaymentId_fkey" FOREIGN KEY ("deliveryPaymentId") REFERENCES "DeliveryPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
