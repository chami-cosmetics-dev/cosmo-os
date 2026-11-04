-- CreateEnum
CREATE TYPE "NewItemRequestStatus" AS ENUM ('open', 'already_have', 'closed');

-- CreateTable
CREATE TABLE "NewItemRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "brandNameNormalized" TEXT NOT NULL,
    "brandIsExisting" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,
    "storeUrl" TEXT,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "status" "NewItemRequestStatus" NOT NULL DEFAULT 'open',
    "createdByUserId" TEXT,
    "statusChangedByUserId" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewItemRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewItemRequestBrandPriority" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "brandNameNormalized" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewItemRequestBrandPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewItemRequest_companyId_status_createdAt_idx" ON "NewItemRequest"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NewItemRequest_companyId_brandNameNormalized_status_created_idx" ON "NewItemRequest"("companyId", "brandNameNormalized", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NewItemRequest_companyId_createdByUserId_createdAt_idx" ON "NewItemRequest"("companyId", "createdByUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NewItemRequestBrandPriority_companyId_brandNameNormalized_idx" ON "NewItemRequestBrandPriority"("companyId", "brandNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "NewItemRequestBrandPriority_companyId_brandNameNormalized_key" ON "NewItemRequestBrandPriority"("companyId", "brandNameNormalized");

-- AddForeignKey
ALTER TABLE "NewItemRequest" ADD CONSTRAINT "NewItemRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewItemRequest" ADD CONSTRAINT "NewItemRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewItemRequest" ADD CONSTRAINT "NewItemRequest_statusChangedByUserId_fkey" FOREIGN KEY ("statusChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewItemRequestBrandPriority" ADD CONSTRAINT "NewItemRequestBrandPriority_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewItemRequestBrandPriority" ADD CONSTRAINT "NewItemRequestBrandPriority_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
