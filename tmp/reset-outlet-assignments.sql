-- Keep only legacy single outletId per profile (undo accidental all-outlet saves).
DELETE FROM "EmployeeProfileOutlet" AS eo
USING "EmployeeProfile" AS ep
WHERE eo."employeeProfileId" = ep."id"
  AND (ep."outletId" IS NULL OR eo."outletId" <> ep."outletId");

INSERT INTO "EmployeeProfileOutlet" ("id", "employeeProfileId", "outletId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), ep."id", ep."outletId", CURRENT_TIMESTAMP
FROM "EmployeeProfile" ep
WHERE ep."outletId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EmployeeProfileOutlet" eo
    WHERE eo."employeeProfileId" = ep."id" AND eo."outletId" = ep."outletId"
  );
