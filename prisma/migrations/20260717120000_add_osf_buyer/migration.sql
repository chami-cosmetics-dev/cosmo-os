-- OSF buyer sheets: named per-buyer views filtered by brand.
CREATE TABLE IF NOT EXISTS "OsfBuyer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OsfBuyer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OsfBuyer_companyId_name_key" ON "OsfBuyer"("companyId", "name");
CREATE INDEX IF NOT EXISTS "OsfBuyer_companyId_sortOrder_idx" ON "OsfBuyer"("companyId", "sortOrder");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OsfBuyer_companyId_fkey') THEN
    ALTER TABLE "OsfBuyer"
      ADD CONSTRAINT "OsfBuyer_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
