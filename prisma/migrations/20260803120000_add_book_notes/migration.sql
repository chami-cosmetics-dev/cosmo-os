-- CreateTable
CREATE TABLE "BookNoteDay" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookNoteDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookNoteRow" (
    "id" TEXT NOT NULL,
    "bookNoteDayId" TEXT NOT NULL,
    "idxNo" TEXT NOT NULL,
    "salesInvoice" TEXT NOT NULL,
    "cash" DECIMAL(12,2) NOT NULL,
    "card" DECIMAL(12,2) NOT NULL,
    "koko" DECIMAL(12,2) NOT NULL,
    "bankTransfer" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookNoteRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookNoteDay_companyId_postingDate_idx" ON "BookNoteDay"("companyId", "postingDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookNoteDay_companyLocationId_postingDate_key" ON "BookNoteDay"("companyLocationId", "postingDate");

-- CreateIndex
CREATE INDEX "BookNoteRow_bookNoteDayId_sortOrder_idx" ON "BookNoteRow"("bookNoteDayId", "sortOrder");

-- CreateIndex
CREATE INDEX "BookNoteRow_salesInvoice_idx" ON "BookNoteRow"("salesInvoice");

-- AddForeignKey
ALTER TABLE "BookNoteDay" ADD CONSTRAINT "BookNoteDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNoteDay" ADD CONSTRAINT "BookNoteDay_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNoteDay" ADD CONSTRAINT "BookNoteDay_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNoteDay" ADD CONSTRAINT "BookNoteDay_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNoteRow" ADD CONSTRAINT "BookNoteRow_bookNoteDayId_fkey" FOREIGN KEY ("bookNoteDayId") REFERENCES "BookNoteDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNoteRow" ADD CONSTRAINT "BookNoteRow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
