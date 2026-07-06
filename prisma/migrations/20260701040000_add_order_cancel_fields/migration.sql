-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancelReason" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
