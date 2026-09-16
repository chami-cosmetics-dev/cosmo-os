-- Additive only: zone → city membership for Shopify Zone A/B resolve.
CREATE TABLE IF NOT EXISTS "RiderDeliveryZoneMember" (
  "id" TEXT NOT NULL,
  "zoneKey" TEXT NOT NULL,
  "zoneLabel" TEXT NOT NULL,
  "districtLabelKey" TEXT NOT NULL,
  "districtLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderDeliveryZoneMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RiderDeliveryZoneMember_zoneKey_districtLabelKey_key"
  ON "RiderDeliveryZoneMember"("zoneKey", "districtLabelKey");

CREATE INDEX IF NOT EXISTS "RiderDeliveryZoneMember_zoneKey_idx"
  ON "RiderDeliveryZoneMember"("zoneKey");

CREATE INDEX IF NOT EXISTS "RiderDeliveryZoneMember_districtLabelKey_idx"
  ON "RiderDeliveryZoneMember"("districtLabelKey");
