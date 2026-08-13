-- Persist emails removed by contact email cleanup for admin Insight display.
CREATE TABLE "ContactRemovedEmail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedByUserId" TEXT,

    CONSTRAINT "ContactRemovedEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactRemovedEmail_contactId_removedAt_idx" ON "ContactRemovedEmail"("contactId", "removedAt" DESC);
CREATE INDEX "ContactRemovedEmail_companyId_contactId_idx" ON "ContactRemovedEmail"("companyId", "contactId");
CREATE INDEX "ContactRemovedEmail_companyId_reason_idx" ON "ContactRemovedEmail"("companyId", "reason");

ALTER TABLE "ContactRemovedEmail" ADD CONSTRAINT "ContactRemovedEmail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRemovedEmail" ADD CONSTRAINT "ContactRemovedEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRemovedEmail" ADD CONSTRAINT "ContactRemovedEmail_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
