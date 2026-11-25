-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltySmsConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "officeContactPhone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltySmsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyWishSend" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "templateKey" TEXT,
    "phoneNumber" TEXT,
    "messageBody" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "smsLogId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyWishSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsTemplate_companyId_purpose_active_idx" ON "SmsTemplate"("companyId", "purpose", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SmsTemplate_companyId_key_key" ON "SmsTemplate"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltySmsConfig_companyId_key" ON "LoyaltySmsConfig"("companyId");

-- CreateIndex
CREATE INDEX "LoyaltyWishSend_companyId_sentAt_idx" ON "LoyaltyWishSend"("companyId", "sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyWishSend_companyId_contactId_tier_key" ON "LoyaltyWishSend"("companyId", "contactId", "tier");

-- AddForeignKey
ALTER TABLE "SmsTemplate" ADD CONSTRAINT "SmsTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltySmsConfig" ADD CONSTRAINT "LoyaltySmsConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyWishSend" ADD CONSTRAINT "LoyaltyWishSend_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyWishSend" ADD CONSTRAINT "LoyaltyWishSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
