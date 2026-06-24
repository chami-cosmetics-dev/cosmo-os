-- CreateTable
CREATE TABLE "PickListGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),

    CONSTRAINT "PickListGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickListGroupOrder" (
    "id" TEXT NOT NULL,
    "pickListGroupId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "PickListGroupOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickListGroup_companyId_downloadedAt_createdAt_idx" ON "PickListGroup"("companyId", "downloadedAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PickListGroupOrder_pickListGroupId_orderId_key" ON "PickListGroupOrder"("pickListGroupId", "orderId");

-- CreateIndex
CREATE INDEX "PickListGroupOrder_orderId_idx" ON "PickListGroupOrder"("orderId");

-- AddForeignKey
ALTER TABLE "PickListGroup" ADD CONSTRAINT "PickListGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickListGroup" ADD CONSTRAINT "PickListGroup_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickListGroupOrder" ADD CONSTRAINT "PickListGroupOrder_pickListGroupId_fkey" FOREIGN KEY ("pickListGroupId") REFERENCES "PickListGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickListGroupOrder" ADD CONSTRAINT "PickListGroupOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
