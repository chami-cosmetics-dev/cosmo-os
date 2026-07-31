-- CreateTable
CREATE TABLE "RiderDeliveryChargeRule" (
    "id" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "district" TEXT,
    "shippingAmount" DECIMAL(12,2) NOT NULL,
    "riderDeliveryCharge" DECIMAL(12,2) NOT NULL,
    "shippingAccount" TEXT,
    "costCenter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderDeliveryChargeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderDeliveryChargeRule_labelKey_key" ON "RiderDeliveryChargeRule"("labelKey");

-- CreateIndex
CREATE INDEX "RiderDeliveryChargeRule_label_idx" ON "RiderDeliveryChargeRule"("label");
