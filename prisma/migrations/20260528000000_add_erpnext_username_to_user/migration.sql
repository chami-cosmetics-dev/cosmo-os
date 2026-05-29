-- Add erpnextUsername to User for POS merchant matching
ALTER TABLE "User" ADD COLUMN "erpnextUsername" TEXT;
CREATE UNIQUE INDEX "User_erpnextUsername_key" ON "User"("erpnextUsername");
