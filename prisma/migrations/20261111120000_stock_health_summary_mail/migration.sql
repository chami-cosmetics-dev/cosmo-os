-- CreateTable
CREATE TABLE "StockHealthSummaryMail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mailDate" TEXT NOT NULL,
    "part" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockHealthSummaryMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockHealthSummaryMail_companyId_mailDate_part_key" ON "StockHealthSummaryMail"("companyId", "mailDate", "part");

-- AddForeignKey
ALTER TABLE "StockHealthSummaryMail" ADD CONSTRAINT "StockHealthSummaryMail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
