ALTER TABLE "ItemCreationRequest"
ADD COLUMN "digitalMarketingBrand" TEXT,
ADD COLUMN "digitalMarketingAssigneeId" TEXT;

CREATE TABLE "ItemCreationBrandAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemCreationBrandAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemCreationBrandAllocation_companyId_brand_key"
ON "ItemCreationBrandAllocation"("companyId", "brand");

CREATE INDEX "ItemCreationBrandAllocation_companyId_userId_idx"
ON "ItemCreationBrandAllocation"("companyId", "userId");

CREATE INDEX "ItemCreationRequest_companyId_digitalMarketingBrand_idx"
ON "ItemCreationRequest"("companyId", "digitalMarketingBrand");

CREATE INDEX "ItemCreationRequest_companyId_digitalMarketingAssigneeId_idx"
ON "ItemCreationRequest"("companyId", "digitalMarketingAssigneeId");

ALTER TABLE "ItemCreationRequest"
ADD CONSTRAINT "ItemCreationRequest_digitalMarketingAssigneeId_fkey"
FOREIGN KEY ("digitalMarketingAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ItemCreationBrandAllocation"
ADD CONSTRAINT "ItemCreationBrandAllocation_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemCreationBrandAllocation"
ADD CONSTRAINT "ItemCreationBrandAllocation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
