-- Move outlet assignment ownership from OutletUser to EmployeeProfile.
-- OutletReview keeps its existing outletId/orderId rows, preserving edited review values.

ALTER TABLE "EmployeeProfile" ADD COLUMN "outletId" TEXT;

WITH ranked_assignments AS (
  SELECT
    ou."userId",
    ou."outletId",
    ROW_NUMBER() OVER (
      PARTITION BY ou."userId"
      ORDER BY ou."updatedAt" DESC, ou."createdAt" DESC, ou."id" DESC
    ) AS rn
  FROM "OutletUser" ou
  INNER JOIN "Outlet" o ON o."id" = ou."outletId"
  INNER JOIN "User" u ON u."id" = ou."userId"
  WHERE u."companyId" = o."companyId"
)
UPDATE "EmployeeProfile" ep
SET "outletId" = ranked_assignments."outletId"
FROM ranked_assignments
WHERE ep."userId" = ranked_assignments."userId"
  AND ep."companyId" = (
    SELECT o."companyId" FROM "Outlet" o WHERE o."id" = ranked_assignments."outletId"
  )
  AND ranked_assignments.rn = 1;

CREATE INDEX "EmployeeProfile_companyId_outletId_idx" ON "EmployeeProfile"("companyId", "outletId");

ALTER TABLE "EmployeeProfile"
ADD CONSTRAINT "EmployeeProfile_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
