-- Run manually in production with a DBA-approved window.
-- These use CONCURRENTLY to reduce lock time on large tables.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_created_desc
  ON "Order" ("companyId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_stage_created_desc
  ON "Order" ("companyId", "fulfillmentStage", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_location_created_desc
  ON "Order" ("companyId", "companyLocationId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_merchant_created_desc
  ON "Order" ("companyId", "assignedMerchantId", "createdAt" DESC);

-- Functional/partial indexes for contact-related order lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_lower_customer_email_created_desc
  ON "Order" ("companyId", lower("customerEmail"), "createdAt" DESC)
  WHERE "customerEmail" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_company_customer_phone_created_desc
  ON "Order" ("companyId", "customerPhone", "createdAt" DESC)
  WHERE "customerPhone" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_item_company_title_variant
  ON "ProductItem" ("companyId", "productTitle", "variantTitle");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_item_company_location
  ON "ProductItem" ("companyId", "companyLocationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_item_company_vendor
  ON "ProductItem" ("companyId", "vendorId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_item_company_category
  ON "ProductItem" ("companyId", "categoryId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failed_webhook_company_resolved_created_desc
  ON "FailedOrderWebhook" ("companyId", "resolvedAt", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failed_webhook_company_created_desc
  ON "FailedOrderWebhook" ("companyId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_master_company_updated_desc
  ON "ContactMaster" ("companyId", "updatedAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_master_company_email
  ON "ContactMaster" ("companyId", "email");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_master_company_phone
  ON "ContactMaster" ("companyId", "phoneNumber");
