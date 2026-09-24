CREATE TABLE IF NOT EXISTS "OsRegistrationSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "emailHeader" TEXT NOT NULL DEFAULT '',
    "emailBody" TEXT NOT NULL DEFAULT '',
    "emailPhotoUrl" TEXT,
    "headerLocation" TEXT,
    "headerBadgeStart" TIMESTAMP(3),
    "headerBadgeEnd" TIMESTAMP(3),
    "headerDate" TEXT,
    "latestQrId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsRegistrationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OsRegistrationSettings_companyId_key"
  ON "OsRegistrationSettings"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationSettings_companyId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationSettings"
      ADD CONSTRAINT "OsRegistrationSettings_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OsRegistrationSettings_latestQrId_fkey'
  ) THEN
    ALTER TABLE "OsRegistrationSettings"
      ADD CONSTRAINT "OsRegistrationSettings_latestQrId_fkey"
      FOREIGN KEY ("latestQrId") REFERENCES "OsRegistrationQr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
