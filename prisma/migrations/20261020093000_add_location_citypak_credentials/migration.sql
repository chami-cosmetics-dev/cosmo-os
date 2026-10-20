-- AlterTable
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "citypakAccountId" TEXT;
ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "citypakApiToken" TEXT;
