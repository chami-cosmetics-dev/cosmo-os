CREATE TABLE "ProductItemAsset" (
  "id"           TEXT         NOT NULL,
  "companyId"    TEXT         NOT NULL,
  "sku"          TEXT         NOT NULL,
  "type"         TEXT         NOT NULL,
  "fileName"     TEXT         NOT NULL,
  "blobUrl"      TEXT         NOT NULL,
  "fileSize"     INTEGER,
  "mimeType"     TEXT,
  "provider"     TEXT         NOT NULL DEFAULT 'vercel_blob',
  "uploadedById" TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductItemAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductItemAsset_companyId_sku_idx" ON "ProductItemAsset"("companyId", "sku");

ALTER TABLE "ProductItemAsset"
  ADD CONSTRAINT "ProductItemAsset_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductItemAsset"
  ADD CONSTRAINT "ProductItemAsset_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
