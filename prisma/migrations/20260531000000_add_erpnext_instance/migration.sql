-- CreateTable
CREATE TABLE "ErpnextInstance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "incomingWebhookSecret" TEXT,
    "cashMop" TEXT,
    "codMop" TEXT,
    "cardDeliveryMop" TEXT,
    "bankTransferMop" TEXT,
    "kokoMop" TEXT,
    "webxpayMop" TEXT,
    "taxesAndCharges" TEXT,
    "shippingRule" TEXT,
    "shippingItem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpnextInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpnextInstance_companyId_idx" ON "ErpnextInstance"("companyId");

-- AddForeignKey
ALTER TABLE "ErpnextInstance" ADD CONSTRAINT "ErpnextInstance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
