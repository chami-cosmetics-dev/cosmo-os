CREATE TABLE IF NOT EXISTS "WaybillUpload" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "unmatchedRows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaybillUpload_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderWaybill"
  ADD COLUMN IF NOT EXISTS "uploadId" TEXT,
  ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;

CREATE INDEX IF NOT EXISTS "WaybillUpload_companyId_createdAt_idx"
  ON "WaybillUpload"("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "WaybillUpload_companyId_uploadedById_createdAt_idx"
  ON "WaybillUpload"("companyId", "uploadedById", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "OrderWaybill_companyId_uploadId_idx"
  ON "OrderWaybill"("companyId", "uploadId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WaybillUpload_companyId_fkey'
  ) THEN
    ALTER TABLE "WaybillUpload"
      ADD CONSTRAINT "WaybillUpload_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WaybillUpload_uploadedById_fkey'
  ) THEN
    ALTER TABLE "WaybillUpload"
      ADD CONSTRAINT "WaybillUpload_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderWaybill_uploadId_fkey'
  ) THEN
    ALTER TABLE "OrderWaybill"
      ADD CONSTRAINT "OrderWaybill_uploadId_fkey"
      FOREIGN KEY ("uploadId") REFERENCES "WaybillUpload"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
