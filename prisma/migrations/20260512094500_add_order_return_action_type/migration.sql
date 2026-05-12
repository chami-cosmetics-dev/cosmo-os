ALTER TABLE "OrderReturn" ADD COLUMN IF NOT EXISTS "actionType" TEXT;

CREATE INDEX IF NOT EXISTS "OrderReturn_companyId_actionType_actionStatus_idx"
  ON "OrderReturn"("companyId", "actionType", "actionStatus");
