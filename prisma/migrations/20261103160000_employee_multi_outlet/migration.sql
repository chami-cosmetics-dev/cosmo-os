-- Multi-outlet staff assignments + daily active outlet date key.

ALTER TABLE "EmployeeProfile" ADD COLUMN IF NOT EXISTS "activeOutletDateKey" TEXT;

CREATE TABLE IF NOT EXISTS "EmployeeProfileOutlet" (
    "id" TEXT NOT NULL,
    "employeeProfileId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeProfileOutlet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeProfileOutlet_employeeProfileId_outletId_key"
  ON "EmployeeProfileOutlet"("employeeProfileId", "outletId");

CREATE INDEX IF NOT EXISTS "EmployeeProfileOutlet_outletId_idx"
  ON "EmployeeProfileOutlet"("outletId");

DO $$ BEGIN
  ALTER TABLE "EmployeeProfileOutlet"
    ADD CONSTRAINT "EmployeeProfileOutlet_employeeProfileId_fkey"
    FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmployeeProfileOutlet"
    ADD CONSTRAINT "EmployeeProfileOutlet_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill assignments from legacy single outletId.
INSERT INTO "EmployeeProfileOutlet" ("id", "employeeProfileId", "outletId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), ep."id", ep."outletId", CURRENT_TIMESTAMP
FROM "EmployeeProfile" ep
WHERE ep."outletId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EmployeeProfileOutlet" eo
    WHERE eo."employeeProfileId" = ep."id" AND eo."outletId" = ep."outletId"
  );
