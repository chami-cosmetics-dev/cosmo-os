-- AlterTable: per-variant OSF column access (Main / VAT Items / Others)
ALTER TABLE "OsfUserColumnAccess" ADD COLUMN IF NOT EXISTS "osfVariant" TEXT NOT NULL DEFAULT 'main';

-- Drop old unique (companyId, userId)
DROP INDEX IF EXISTS "OsfUserColumnAccess_companyId_userId_key";

-- Ensure existing rows are Main (default already); create unique including variant
CREATE UNIQUE INDEX IF NOT EXISTS "OsfUserColumnAccess_companyId_userId_osfVariant_key"
  ON "OsfUserColumnAccess"("companyId", "userId", "osfVariant");
