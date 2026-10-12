-- Finance accepted a printed rider cash slip for one rider and date range.
CREATE TABLE "RiderFinanceCashReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyTotals" JSONB NOT NULL,
    "fullTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderFinanceCashReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiderFinanceCashReceipt_companyId_riderId_periodFrom_period_idx" ON "RiderFinanceCashReceipt"("companyId", "riderId", "periodFrom", "periodTo");

CREATE INDEX "RiderFinanceCashReceipt_receivedById_idx" ON "RiderFinanceCashReceipt"("receivedById");

ALTER TABLE "RiderFinanceCashReceipt" ADD CONSTRAINT "RiderFinanceCashReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiderFinanceCashReceipt" ADD CONSTRAINT "RiderFinanceCashReceipt_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiderFinanceCashReceipt" ADD CONSTRAINT "RiderFinanceCashReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
