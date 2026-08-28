ALTER TABLE "ApprovalRequest"
ADD COLUMN "multipleKokoPayments" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ApprovalKokoReference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalKokoReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalKokoReference_companyId_reference_key"
ON "ApprovalKokoReference"("companyId", "reference");

CREATE INDEX "ApprovalKokoReference_approvalRequestId_sortOrder_idx"
ON "ApprovalKokoReference"("approvalRequestId", "sortOrder");

ALTER TABLE "ApprovalKokoReference"
ADD CONSTRAINT "ApprovalKokoReference_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalKokoReference"
ADD CONSTRAINT "ApprovalKokoReference_approvalRequestId_fkey"
FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
