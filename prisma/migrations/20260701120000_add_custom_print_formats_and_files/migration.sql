-- Custom HTML print formats and app-managed files.
CREATE TABLE "PrintFormat" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PrintFormat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "File" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "fileSize" INTEGER,
  "mimeType" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'vercel_blob',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanyLocation" ADD COLUMN "defaultOrderPrintFormatId" TEXT;

CREATE UNIQUE INDEX "PrintFormat_companyId_name_key" ON "PrintFormat"("companyId", "name");
CREATE INDEX "PrintFormat_companyId_isEnabled_name_idx" ON "PrintFormat"("companyId", "isEnabled", "name");
CREATE INDEX "File_companyId_createdAt_idx" ON "File"("companyId", "createdAt" DESC);

ALTER TABLE "PrintFormat"
  ADD CONSTRAINT "PrintFormat_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "File"
  ADD CONSTRAINT "File_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "File"
  ADD CONSTRAINT "File_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyLocation"
  ADD CONSTRAINT "CompanyLocation_defaultOrderPrintFormatId_fkey"
  FOREIGN KEY ("defaultOrderPrintFormatId") REFERENCES "PrintFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
