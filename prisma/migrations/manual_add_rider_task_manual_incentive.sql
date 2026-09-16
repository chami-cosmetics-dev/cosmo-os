-- Additive: staff manual district override for unmatched rider incentives.
ALTER TABLE "RiderDeliveryTask"
  ADD COLUMN IF NOT EXISTS "manualIncentiveLabelKey" TEXT,
  ADD COLUMN IF NOT EXISTS "manualIncentiveLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "manualIncentiveSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manualIncentiveSetById" TEXT;

CREATE INDEX IF NOT EXISTS "RiderDeliveryTask_manualIncentiveLabelKey_idx"
  ON "RiderDeliveryTask"("manualIncentiveLabelKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RiderDeliveryTask_manualIncentiveSetById_fkey'
  ) THEN
    ALTER TABLE "RiderDeliveryTask"
      ADD CONSTRAINT "RiderDeliveryTask_manualIncentiveSetById_fkey"
      FOREIGN KEY ("manualIncentiveSetById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
