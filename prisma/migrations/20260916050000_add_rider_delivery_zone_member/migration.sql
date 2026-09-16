-- CreateTable
CREATE TABLE "RiderDeliveryZoneMember" (
    "id" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "zoneLabel" TEXT NOT NULL,
    "districtLabelKey" TEXT NOT NULL,
    "districtLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderDeliveryZoneMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiderDeliveryZoneMember_zoneKey_idx" ON "RiderDeliveryZoneMember"("zoneKey");

-- CreateIndex
CREATE INDEX "RiderDeliveryZoneMember_districtLabelKey_idx" ON "RiderDeliveryZoneMember"("districtLabelKey");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDeliveryZoneMember_zoneKey_districtLabelKey_key" ON "RiderDeliveryZoneMember"("zoneKey", "districtLabelKey");
