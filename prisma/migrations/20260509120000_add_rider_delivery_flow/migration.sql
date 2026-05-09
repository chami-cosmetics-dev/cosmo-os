-- CreateEnum
CREATE TYPE "RiderDeliveryTaskStatus" AS ENUM ('assigned', 'accepted', 'arrived', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DeliveryPaymentMethod" AS ENUM ('cod', 'bank_transfer', 'card', 'already_paid');

-- CreateEnum
CREATE TYPE "DeliveryCollectionStatus" AS ENUM ('pending', 'collected', 'partially_collected', 'not_collected');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('pending', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "RiderCashHandoverStatus" AS ENUM ('submitted', 'received');

-- CreateEnum
CREATE TYPE "RiderMobileSessionStatus" AS ENUM ('active', 'revoked');

-- AlterTable
ALTER TABLE "Complaint" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryFailedReason" TEXT,
ADD COLUMN "deliveryOutcome" "DeliveryOutcome",
ADD COLUMN "lastRiderUpdateAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RiderMobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "RiderMobileSessionStatus" NOT NULL DEFAULT 'active',
    "deviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderMobileSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderDeliveryTask" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "status" "RiderDeliveryTaskStatus" NOT NULL DEFAULT 'assigned',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "latestSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderDeliveryTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "cashHandoverId" TEXT,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "collectedAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "DeliveryPaymentMethod" NOT NULL,
    "collectionStatus" "DeliveryCollectionStatus" NOT NULL,
    "referenceNote" TEXT,
    "bankReference" TEXT,
    "cardReference" TEXT,
    "collectedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderCashHandover" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "handoverDate" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "status" "RiderCashHandoverStatus" NOT NULL DEFAULT 'submitted',
    "totalExpectedCash" DECIMAL(12,2) NOT NULL,
    "totalHandedOverCash" DECIMAL(12,2) NOT NULL,
    "varianceAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderCashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderCashHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "cashAmount" DECIMAL(12,2) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderCashHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderMobileSession_tokenHash_key" ON "RiderMobileSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RiderMobileSession_userId_status_expiresAt_idx" ON "RiderMobileSession"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDeliveryTask_orderId_key" ON "RiderDeliveryTask"("orderId");

-- CreateIndex
CREATE INDEX "RiderDeliveryTask_riderId_status_assignedAt_idx" ON "RiderDeliveryTask"("riderId", "status", "assignedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPayment_orderId_key" ON "DeliveryPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPayment_idempotencyKey_key" ON "DeliveryPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DeliveryPayment_cashHandoverId_idx" ON "DeliveryPayment"("cashHandoverId");

-- CreateIndex
CREATE INDEX "DeliveryPayment_riderId_collectedAt_idx" ON "DeliveryPayment"("riderId", "collectedAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryPayment_paymentMethod_collectionStatus_idx" ON "DeliveryPayment"("paymentMethod", "collectionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RiderCashHandover_idempotencyKey_key" ON "RiderCashHandover"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RiderCashHandover_riderId_handoverDate_idx" ON "RiderCashHandover"("riderId", "handoverDate" DESC);

-- CreateIndex
CREATE INDEX "RiderCashHandoverItem_handoverId_idx" ON "RiderCashHandoverItem"("handoverId");

-- CreateIndex
CREATE UNIQUE INDEX "RiderCashHandoverItem_handoverId_companyLocationId_key" ON "RiderCashHandoverItem"("handoverId", "companyLocationId");

-- AddForeignKey
ALTER TABLE "RiderMobileSession" ADD CONSTRAINT "RiderMobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDeliveryTask" ADD CONSTRAINT "RiderDeliveryTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDeliveryTask" ADD CONSTRAINT "RiderDeliveryTask_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_cashHandoverId_fkey" FOREIGN KEY ("cashHandoverId") REFERENCES "RiderCashHandover"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashHandover" ADD CONSTRAINT "RiderCashHandover_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashHandover" ADD CONSTRAINT "RiderCashHandover_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashHandoverItem" ADD CONSTRAINT "RiderCashHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "RiderCashHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashHandoverItem" ADD CONSTRAINT "RiderCashHandoverItem_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MerchantOrderReview_companyId_merchantUserId_reviewStatus_up_id" RENAME TO "MerchantOrderReview_companyId_merchantUserId_reviewStatus_u_idx";

-- RenameIndex
ALTER INDEX "Order_companyId_fulfillmentStage_sampleFreeIssueSendLaterDate_i" RENAME TO "Order_companyId_fulfillmentStage_sampleFreeIssueSendLaterDa_idx";
