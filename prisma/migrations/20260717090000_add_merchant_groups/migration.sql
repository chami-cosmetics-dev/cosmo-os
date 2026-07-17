CREATE TABLE "MerchantGroup" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MerchantGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantGroupMember" (
  "id" TEXT NOT NULL,
  "merchantGroupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MerchantGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantGroup_companyId_name_key" ON "MerchantGroup"("companyId", "name");
CREATE INDEX "MerchantGroup_companyId_idx" ON "MerchantGroup"("companyId");
CREATE UNIQUE INDEX "MerchantGroupMember_userId_key" ON "MerchantGroupMember"("userId");
CREATE INDEX "MerchantGroupMember_merchantGroupId_idx" ON "MerchantGroupMember"("merchantGroupId");
CREATE INDEX "MerchantGroupMember_userId_idx" ON "MerchantGroupMember"("userId");

ALTER TABLE "MerchantGroupMember"
  ADD CONSTRAINT "MerchantGroupMember_merchantGroupId_fkey"
  FOREIGN KEY ("merchantGroupId") REFERENCES "MerchantGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantGroupMember"
  ADD CONSTRAINT "MerchantGroupMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
