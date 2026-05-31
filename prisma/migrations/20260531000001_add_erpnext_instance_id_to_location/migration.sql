-- Add erpnextInstanceId foreign key to CompanyLocation

ALTER TABLE "CompanyLocation" ADD COLUMN "erpnextInstanceId" TEXT;

ALTER TABLE "CompanyLocation"
  ADD CONSTRAINT "CompanyLocation_erpnextInstanceId_fkey"
  FOREIGN KEY ("erpnextInstanceId")
  REFERENCES "ErpnextInstance"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CompanyLocation_erpnextInstanceId_idx" ON "CompanyLocation"("erpnextInstanceId");
