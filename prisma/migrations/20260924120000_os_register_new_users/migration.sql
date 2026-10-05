-- AlterTable
ALTER TABLE "ContactMaster" ADD COLUMN IF NOT EXISTS "osRegistrationCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContactMaster" ADD COLUMN IF NOT EXISTS "osRegLocation" TEXT;
ALTER TABLE "ContactMaster" ADD COLUMN IF NOT EXISTS "osRegBadgeStart" TIMESTAMP(3);
ALTER TABLE "ContactMaster" ADD COLUMN IF NOT EXISTS "osRegBadgeEnd" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ContactMaster_companyId_osRegistrationCreated_osRegLocation_idx"
  ON "ContactMaster"("companyId", "osRegistrationCreated", "osRegLocation");

-- CreateTable
CREATE TABLE IF NOT EXISTS "OsRegistrationQr" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "badgeStart" TIMESTAMP(3) NOT NULL,
    "badgeEnd" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsRegistrationQr_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OsRegistrationQr_token_key" ON "OsRegistrationQr"("token");
CREATE INDEX IF NOT EXISTS "OsRegistrationQr_companyId_createdAt_idx" ON "OsRegistrationQr"("companyId", "createdAt");

CREATE TABLE IF NOT EXISTS "OsRegistrationCapture" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "qrId" TEXT,
    "location" TEXT NOT NULL,
    "badgeStart" TIMESTAMP(3) NOT NULL,
    "badgeEnd" TIMESTAMP(3) NOT NULL,
    "captureDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsRegistrationCapture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OsRegistrationCapture_companyId_captureDate_idx" ON "OsRegistrationCapture"("companyId", "captureDate");
CREATE INDEX IF NOT EXISTS "OsRegistrationCapture_companyId_contactId_idx" ON "OsRegistrationCapture"("companyId", "contactId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationQr_companyId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationQr"
      ADD CONSTRAINT "OsRegistrationQr_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationQr_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationQr"
      ADD CONSTRAINT "OsRegistrationQr_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationCapture_companyId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationCapture"
      ADD CONSTRAINT "OsRegistrationCapture_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationCapture_contactId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationCapture"
      ADD CONSTRAINT "OsRegistrationCapture_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationCapture_qrId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationCapture"
      ADD CONSTRAINT "OsRegistrationCapture_qrId_fkey"
      FOREIGN KEY ("qrId") REFERENCES "OsRegistrationQr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationCapture_actorUserId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationCapture"
      ADD CONSTRAINT "OsRegistrationCapture_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
