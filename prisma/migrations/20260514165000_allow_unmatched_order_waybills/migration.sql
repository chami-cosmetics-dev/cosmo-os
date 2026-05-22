ALTER TABLE "OrderWaybill"
  ALTER COLUMN "orderId" DROP NOT NULL;

ALTER TABLE "OrderWaybill" DROP CONSTRAINT IF EXISTS "OrderWaybill_orderId_fkey";

ALTER TABLE "OrderWaybill"
  ADD CONSTRAINT "OrderWaybill_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
