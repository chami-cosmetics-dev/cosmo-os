-- CreateEnum
CREATE TYPE "MaterialTransferDirection" AS ENUM ('store_to_shop', 'shop_to_main');

-- AlterEnum
ALTER TYPE "MaterialTransferStatus" ADD VALUE 'requested';
ALTER TYPE "MaterialTransferStatus" ADD VALUE 'confirming';
ALTER TYPE "MaterialTransferStatus" ADD VALUE 'confirmed';

-- AlterTable
ALTER TABLE "MaterialTransfer" ADD COLUMN "direction" "MaterialTransferDirection" NOT NULL DEFAULT 'store_to_shop',
ALTER COLUMN "erpName" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MaterialTransferLine" ADD COLUMN "receivedQtyUpdatedAt" TIMESTAMP(3),
ADD COLUMN "receivedQtyUpdatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "MaterialTransfer_companyId_direction_status_idx" ON "MaterialTransfer"("companyId", "direction", "status");

-- AddForeignKey
ALTER TABLE "MaterialTransferLine" ADD CONSTRAINT "MaterialTransferLine_receivedQtyUpdatedByUserId_fkey" FOREIGN KEY ("receivedQtyUpdatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
