ALTER TABLE "ApprovalRequest"
ADD COLUMN "kokoReference" TEXT;

CREATE UNIQUE INDEX "ApprovalRequest_companyId_kokoReference_key"
ON "ApprovalRequest"("companyId", "kokoReference");
