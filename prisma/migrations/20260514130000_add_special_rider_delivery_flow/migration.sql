CREATE TYPE "RiderDeliveryKind" AS ENUM ('normal', 'rearranged', 'exchange');

CREATE TYPE "OldItemCollectionStatus" AS ENUM ('pending', 'collected', 'not_collected');

ALTER TABLE "RiderDeliveryTask"
  ADD COLUMN "deliveryKind" "RiderDeliveryKind" NOT NULL DEFAULT 'normal',
  ADD COLUMN "exchangeId" TEXT,
  ADD COLUMN "oldOrderLabel" TEXT,
  ADD COLUMN "replacementOrderLabel" TEXT,
  ADD COLUMN "requiresOldItemCollection" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "oldItemCollectionStatus" "OldItemCollectionStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "oldItemCollectionRemark" TEXT,
  ADD COLUMN "exchangePaymentDifference" DECIMAL(12,2);

CREATE INDEX "RiderDeliveryTask_exchangeId_idx" ON "RiderDeliveryTask"("exchangeId");

ALTER TABLE "RiderDeliveryTask"
  ADD CONSTRAINT "RiderDeliveryTask_exchangeId_fkey"
  FOREIGN KEY ("exchangeId") REFERENCES "OrderExchange"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
