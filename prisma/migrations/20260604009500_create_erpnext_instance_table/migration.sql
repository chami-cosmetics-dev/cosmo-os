-- ErpnextInstance was added to schema.prisma without a create-table migration on some DBs.
-- Idempotent so Vault (table already exists via db:push) and Cosmo dev both succeed.

CREATE TABLE IF NOT EXISTS "ErpnextInstance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "incomingWebhookSecret" TEXT,
    "cashMop" TEXT,
    "codMop" TEXT,
    "cardDeliveryMop" TEXT,
    "bankTransferMop" TEXT,
    "kokoMop" TEXT,
    "webxpayMop" TEXT,
    "taxesAndCharges" TEXT,
    "shippingRule" TEXT,
    "shippingItem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpnextInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ErpnextInstance_companyId_idx" ON "ErpnextInstance"("companyId");

DO $$ BEGIN
    ALTER TABLE "ErpnextInstance" ADD CONSTRAINT "ErpnextInstance_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "erpnextInstanceId" TEXT;

DO $$ BEGIN
    ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_erpnextInstanceId_fkey"
        FOREIGN KEY ("erpnextInstanceId") REFERENCES "ErpnextInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
