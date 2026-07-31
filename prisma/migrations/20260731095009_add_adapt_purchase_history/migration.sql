-- CreateTable
CREATE TABLE "AdaptPurchaseHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "companyLocationId" TEXT,
    "adaptInvoiceKey" TEXT NOT NULL,
    "salesInvoiceMasterId" TEXT,
    "salesInvoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "ttlAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "locationName" TEXT,
    "salesLocationId" TEXT,
    "paymentMethod" TEXT,
    "merchantKnownName" TEXT,
    "adaptMerchantId" TEXT,
    "adaptCustomerMasterId" TEXT,
    "rawPaymentContext" JSONB,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdaptPurchaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdaptPurchaseHistory_contactId_invoiceDate_idx" ON "AdaptPurchaseHistory"("contactId", "invoiceDate" DESC);

-- CreateIndex
CREATE INDEX "AdaptPurchaseHistory_companyId_invoiceDate_idx" ON "AdaptPurchaseHistory"("companyId", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptPurchaseHistory_companyId_adaptInvoiceKey_key" ON "AdaptPurchaseHistory"("companyId", "adaptInvoiceKey");

-- AddForeignKey
ALTER TABLE "AdaptPurchaseHistory" ADD CONSTRAINT "AdaptPurchaseHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptPurchaseHistory" ADD CONSTRAINT "AdaptPurchaseHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptPurchaseHistory" ADD CONSTRAINT "AdaptPurchaseHistory_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
