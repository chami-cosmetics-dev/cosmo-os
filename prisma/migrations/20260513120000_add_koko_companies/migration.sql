CREATE TABLE IF NOT EXISTS "KokoCompany" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kokoName" TEXT NOT NULL,
    "invoicePrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KokoCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KokoCompany_companyId_label_key"
  ON "KokoCompany"("companyId", "label");

CREATE INDEX IF NOT EXISTS "KokoCompany_companyId_createdAt_idx"
  ON "KokoCompany"("companyId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'KokoCompany_companyId_fkey'
  ) THEN
    ALTER TABLE "KokoCompany"
      ADD CONSTRAINT "KokoCompany_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
