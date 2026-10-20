-- An order can now hold several gift voucher batch codes.
DROP INDEX "GiftVoucherCode_orderId_key";
CREATE INDEX "GiftVoucherCode_orderId_idx" ON "GiftVoucherCode"("orderId");
