-- AlterTable
ALTER TABLE "ShopifyAbandonedCheckout" ADD COLUMN IF NOT EXISTS "billingAddressText" TEXT;
ALTER TABLE "ShopifyAbandonedCheckout" ADD COLUMN IF NOT EXISTS "shippingAddressText" TEXT;
