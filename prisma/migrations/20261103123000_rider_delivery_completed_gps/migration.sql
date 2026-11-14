-- GPS captured when rider marks delivery complete.
ALTER TABLE "RiderDeliveryTask" ADD COLUMN IF NOT EXISTS "completedLatitude" DOUBLE PRECISION;
ALTER TABLE "RiderDeliveryTask" ADD COLUMN IF NOT EXISTS "completedLongitude" DOUBLE PRECISION;
ALTER TABLE "RiderDeliveryTask" ADD COLUMN IF NOT EXISTS "completedAccuracyMeters" DOUBLE PRECISION;
ALTER TABLE "RiderDeliveryTask" ADD COLUMN IF NOT EXISTS "completedLocationAt" TIMESTAMP(3);
