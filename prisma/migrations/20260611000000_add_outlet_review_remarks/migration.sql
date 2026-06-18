-- Outlet tables were added to schema.prisma without a create-table migration in this repo.
-- Cosmo prod never had OutletReview; dev may already have tables from older migration names.
-- Idempotent so all three DBs can deploy safely.

CREATE TABLE IF NOT EXISTS "Outlet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Outlet_companyId_name_key" ON "Outlet"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Outlet_companyId_idx" ON "Outlet"("companyId");

DO $$ BEGIN
    ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OutletUser" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutletUser_outletId_userId_key" ON "OutletUser"("outletId", "userId");
CREATE INDEX IF NOT EXISTS "OutletUser_outletId_idx" ON "OutletUser"("outletId");
CREATE INDEX IF NOT EXISTS "OutletUser_userId_idx" ON "OutletUser"("userId");

DO $$ BEGIN
    ALTER TABLE "OutletUser" ADD CONSTRAINT "OutletUser_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OutletReview" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewRequested" TEXT,
    "reviewCollected" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutletReview_orderId_key" ON "OutletReview"("orderId");
CREATE INDEX IF NOT EXISTS "OutletReview_outletId_idx" ON "OutletReview"("outletId");
CREATE INDEX IF NOT EXISTS "OutletReview_orderId_idx" ON "OutletReview"("orderId");

DO $$ BEGIN
    ALTER TABLE "OutletReview" ADD CONSTRAINT "OutletReview_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OutletReview" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

ALTER TABLE "CompanyLocation" ADD COLUMN IF NOT EXISTS "fulfillmentBlocked" BOOLEAN NOT NULL DEFAULT false;
