ALTER TABLE "ItemCreationRequest"
ADD COLUMN IF NOT EXISTS "digitalMarketingAssigneeIds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "ItemCreationBrandAllocation"
ADD COLUMN IF NOT EXISTS "userIds" JSONB NOT NULL DEFAULT '[]';

UPDATE "ItemCreationRequest"
SET "digitalMarketingAssigneeIds" = jsonb_build_array("digitalMarketingAssigneeId")
WHERE "digitalMarketingAssigneeId" IS NOT NULL
  AND "digitalMarketingAssigneeIds" = '[]'::jsonb;

UPDATE "ItemCreationBrandAllocation"
SET "userIds" = jsonb_build_array("userId")
WHERE "userIds" = '[]'::jsonb;
