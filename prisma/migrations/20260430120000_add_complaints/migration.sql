CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Complaint_companyId_status_createdAt_idx" ON "Complaint"("companyId", "status", "createdAt" DESC);
CREATE INDEX "Complaint_companyId_createdById_createdAt_idx" ON "Complaint"("companyId", "createdById", "createdAt" DESC);

ALTER TABLE "Complaint"
ADD CONSTRAINT "Complaint_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Complaint"
ADD CONSTRAINT "Complaint_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Complaint"
ADD CONSTRAINT "Complaint_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
