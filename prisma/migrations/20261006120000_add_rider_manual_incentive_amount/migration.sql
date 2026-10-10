-- Staff-typed rider pay when no charge-sheet district fits.
ALTER TABLE "RiderDeliveryTask" ADD COLUMN "manualIncentiveAmount" DECIMAL(12,2);
