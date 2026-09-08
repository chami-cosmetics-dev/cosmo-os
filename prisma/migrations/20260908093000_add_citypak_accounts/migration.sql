CREATE TABLE IF NOT EXISTS "CitypakAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "invoicePrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitypakAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CitypakAccount_companyId_label_key"
  ON "CitypakAccount"("companyId", "label");

CREATE UNIQUE INDEX IF NOT EXISTS "CitypakAccount_companyId_invoicePrefix_key"
  ON "CitypakAccount"("companyId", "invoicePrefix");

CREATE UNIQUE INDEX IF NOT EXISTS "CitypakAccount_companyId_accountId_key"
  ON "CitypakAccount"("companyId", "accountId");

CREATE INDEX IF NOT EXISTS "CitypakAccount_companyId_createdAt_idx"
  ON "CitypakAccount"("companyId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CitypakAccount_companyId_fkey'
  ) THEN
    ALTER TABLE "CitypakAccount"
      ADD CONSTRAINT "CitypakAccount_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
