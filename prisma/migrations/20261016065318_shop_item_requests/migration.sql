-- CreateEnum
CREATE TYPE "ShopItemRequestStatus" AS ENUM ('pending', 'done');

-- CreateTable
CREATE TABLE "ShopItemRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "outletName" TEXT NOT NULL,
    "status" "ShopItemRequestStatus" NOT NULL DEFAULT 'pending',
    "createdByUserId" TEXT,
    "doneByUserId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItemRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItemRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "barcode" TEXT NOT NULL DEFAULT '',
    "neededQty" INTEGER NOT NULL,
    "shopAvailability" TEXT,

    CONSTRAINT "ShopItemRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItemRequest_companyId_status_createdAt_idx" ON "ShopItemRequest"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShopItemRequest_companyId_outletName_status_createdAt_idx" ON "ShopItemRequest"("companyId", "outletName", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShopItemRequestLine_requestId_idx" ON "ShopItemRequestLine"("requestId");

-- AddForeignKey
ALTER TABLE "ShopItemRequest" ADD CONSTRAINT "ShopItemRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItemRequest" ADD CONSTRAINT "ShopItemRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItemRequest" ADD CONSTRAINT "ShopItemRequest_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItemRequestLine" ADD CONSTRAINT "ShopItemRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ShopItemRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
