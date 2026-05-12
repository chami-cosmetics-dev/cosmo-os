CREATE TYPE "OrderReturnActionStatus" AS ENUM ('pending', 'solved');

CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantUserId" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "shippingServiceType" TEXT NOT NULL,
    "shippingServiceName" TEXT NOT NULL,
    "riderId" TEXT,
    "courierServiceId" TEXT,
    "actionStatus" "OrderReturnActionStatus" NOT NULL DEFAULT 'pending',
    "actionRemark" TEXT,
    "actionDate" TIMESTAMP(3),
    "returnedById" TEXT,
    "actionById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderReturn_companyId_returnDate_idx" ON "OrderReturn"("companyId", "returnDate" DESC);
CREATE INDEX "OrderReturn_companyId_merchantUserId_actionStatus_returnDate_idx" ON "OrderReturn"("companyId", "merchantUserId", "actionStatus", "returnDate" DESC);
CREATE INDEX "OrderReturn_orderId_createdAt_idx" ON "OrderReturn"("orderId", "createdAt" DESC);

ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_actionById_fkey" FOREIGN KEY ("actionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_courierServiceId_fkey" FOREIGN KEY ("courierServiceId") REFERENCES "CourierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
