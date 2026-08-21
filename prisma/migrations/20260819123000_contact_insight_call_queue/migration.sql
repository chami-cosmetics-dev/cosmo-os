-- Admin-assigned merchant call-update queue for Customer Insight.
CREATE TABLE "ContactInsightCallQueue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "merchantLabel" TEXT NOT NULL,
    "merchantUserId" TEXT,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactInsightCallQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactInsightCallQueue_companyId_contactId_key" ON "ContactInsightCallQueue"("companyId", "contactId");
CREATE INDEX "ContactInsightCallQueue_companyId_merchantLabel_status_idx" ON "ContactInsightCallQueue"("companyId", "merchantLabel", "status");
CREATE INDEX "ContactInsightCallQueue_companyId_merchantUserId_status_idx" ON "ContactInsightCallQueue"("companyId", "merchantUserId", "status");
CREATE INDEX "ContactInsightCallQueue_companyId_status_assignedAt_idx" ON "ContactInsightCallQueue"("companyId", "status", "assignedAt");

ALTER TABLE "ContactInsightCallQueue" ADD CONSTRAINT "ContactInsightCallQueue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactInsightCallQueue" ADD CONSTRAINT "ContactInsightCallQueue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactInsightCallQueue" ADD CONSTRAINT "ContactInsightCallQueue_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactInsightCallQueue" ADD CONSTRAINT "ContactInsightCallQueue_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactInsightCallQueue" ADD CONSTRAINT "ContactInsightCallQueue_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
