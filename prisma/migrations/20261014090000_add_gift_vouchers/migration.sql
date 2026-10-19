CREATE TABLE "GiftVoucherGroup" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "codePrefix" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftVoucherGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftVoucherCode" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sequence" INTEGER,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "orderId" TEXT,
  "orderNo" TEXT,
  "usedAt" TIMESTAMP(3),
  "phoneNo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftVoucherCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiftVoucherGroup_companyId_name_key" ON "GiftVoucherGroup"("companyId", "name");
CREATE INDEX "GiftVoucherGroup_companyId_codePrefix_idx" ON "GiftVoucherGroup"("companyId", "codePrefix");
CREATE INDEX "GiftVoucherGroup_companyId_startDate_idx" ON "GiftVoucherGroup"("companyId", "startDate");

CREATE UNIQUE INDEX "GiftVoucherCode_orderId_key" ON "GiftVoucherCode"("orderId");
CREATE UNIQUE INDEX "GiftVoucherCode_companyId_code_key" ON "GiftVoucherCode"("companyId", "code");
CREATE INDEX "GiftVoucherCode_groupId_sequence_idx" ON "GiftVoucherCode"("groupId", "sequence");
CREATE INDEX "GiftVoucherCode_companyId_used_idx" ON "GiftVoucherCode"("companyId", "used");
CREATE INDEX "GiftVoucherCode_companyId_usedAt_idx" ON "GiftVoucherCode"("companyId", "usedAt");

ALTER TABLE "GiftVoucherGroup"
  ADD CONSTRAINT "GiftVoucherGroup_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiftVoucherCode"
  ADD CONSTRAINT "GiftVoucherCode_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiftVoucherCode"
  ADD CONSTRAINT "GiftVoucherCode_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GiftVoucherCode"
  ADD CONSTRAINT "GiftVoucherCode_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "GiftVoucherGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
