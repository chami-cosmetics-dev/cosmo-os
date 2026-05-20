CREATE TYPE "CosmoAcademyMediaType" AS ENUM ('voice', 'video', 'image', 'post');

CREATE TABLE "CosmoAcademyExplanation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "primaryProductItemId" TEXT NOT NULL,
    "createdById" TEXT,
    "productKey" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "productTitle" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CosmoAcademyExplanation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CosmoAcademyMedia" (
    "id" TEXT NOT NULL,
    "explanationId" TEXT NOT NULL,
    "mediaType" "CosmoAcademyMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmoAcademyMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CosmoAcademyExplanation_companyId_productKey_idx" ON "CosmoAcademyExplanation"("companyId", "productKey");
CREATE INDEX "CosmoAcademyExplanation_companyId_createdAt_idx" ON "CosmoAcademyExplanation"("companyId", "createdAt" DESC);
CREATE INDEX "CosmoAcademyExplanation_primaryProductItemId_idx" ON "CosmoAcademyExplanation"("primaryProductItemId");
CREATE INDEX "CosmoAcademyMedia_explanationId_idx" ON "CosmoAcademyMedia"("explanationId");

ALTER TABLE "CosmoAcademyExplanation" ADD CONSTRAINT "CosmoAcademyExplanation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CosmoAcademyExplanation" ADD CONSTRAINT "CosmoAcademyExplanation_primaryProductItemId_fkey" FOREIGN KEY ("primaryProductItemId") REFERENCES "ProductItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CosmoAcademyExplanation" ADD CONSTRAINT "CosmoAcademyExplanation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CosmoAcademyMedia" ADD CONSTRAINT "CosmoAcademyMedia_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "CosmoAcademyExplanation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
