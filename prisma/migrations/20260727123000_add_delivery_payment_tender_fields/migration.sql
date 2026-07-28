-- Cash tender fields: customer gave + change balance on delivery payment.
ALTER TABLE "DeliveryPayment" ADD COLUMN "customerGaveAmount" DECIMAL(12,2);
ALTER TABLE "DeliveryPayment" ADD COLUMN "changeAmount" DECIMAL(12,2);
