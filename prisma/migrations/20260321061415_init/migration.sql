-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FulfillmentStage" AS ENUM ('order_received', 'sample_free_issue', 'print', 'ready_to_dispatch', 'dispatched', 'invoice_complete', 'delivery_complete');

-- CreateEnum
CREATE TYPE "SampleFreeIssueType" AS ENUM ('sample', 'free_issue');

-- CreateEnum
CREATE TYPE "OrderRemarkType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "SmsNotificationTrigger" AS ENUM ('order_received', 'package_ready', 'dispatched', 'rider_dispatched', 'delivery_complete');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'resigned');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeSize" TEXT,
    "address" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailedOrderWebhook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyTopic" TEXT,
    "errorMessage" TEXT NOT NULL,
    "errorStack" TEXT,
    "rawPayload" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailedOrderWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyWebhookSecret" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyWebhookSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "vendorId" TEXT,
    "categoryId" TEXT,
    "status" TEXT,
    "productType" TEXT,
    "handle" TEXT,
    "imageUrl" TEXT,
    "tags" TEXT,
    "barcode" TEXT,
    "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "roleId" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "departmentId" TEXT,
    "designationId" TEXT,
    "employeeNumber" TEXT,
    "epfNumber" TEXT,
    "locationId" TEXT,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "knownName" TEXT,
    "mobile" TEXT,
    "nicNo" TEXT,
    "couponCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shopifyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profilePhotoUrl" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceEmail" TEXT,
    "invoiceFooter" TEXT,
    "invoiceHeader" TEXT,
    "invoicePhone" TEXT,
    "invoiceSubHeader" TEXT,
    "shopifyLocationId" TEXT,
    "shopifyShopName" TEXT,
    "shortName" TEXT,
    "locationReference" TEXT,
    "defaultMerchantUserId" TEXT,
    "logoUrl" TEXT,
    "shopifyAdminStoreHandle" TEXT,

    CONSTRAINT "CompanyLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "defaultAddress" JSONB,
    "lastPurchaseAt" TIMESTAMP(3),
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "assignedMerchantId" TEXT,
    "customerId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "shopifyUserId" TEXT,
    "orderNumber" TEXT,
    "name" TEXT,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "subtotalPrice" DECIMAL(12,2),
    "totalDiscounts" DECIMAL(12,2),
    "totalTax" DECIMAL(12,2),
    "totalShipping" DECIMAL(12,2),
    "currency" TEXT,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "paymentGatewayNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentGatewayPrimary" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "shippingAddress" JSONB,
    "billingAddress" JSONB,
    "discountCodes" JSONB,
    "discountApplications" JSONB,
    "shippingLines" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryCompleteAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedByCourierServiceId" TEXT,
    "dispatchedByRiderId" TEXT,
    "fulfillmentStage" "FulfillmentStage" NOT NULL DEFAULT 'order_received',
    "invoiceCompleteAt" TIMESTAMP(3),
    "packageHoldReasonId" TEXT,
    "packageOnHoldAt" TIMESTAMP(3),
    "packageReadyAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "riderDeliveryToken" TEXT,
    "sampleFreeIssueCompleteAt" TIMESTAMP(3),
    "sampleFreeIssueCompleteById" TEXT,
    "deliveryCompleteById" TEXT,
    "dispatchedById" TEXT,
    "invoiceCompleteById" TEXT,
    "lastPrintedAt" TIMESTAMP(3),
    "lastPrintedById" TEXT,
    "packageReadyById" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productItemId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Designation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "epfNumber" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "designationId" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "resignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offboardingAcknowledgedAt" TIMESTAMP(3),
    "resignationReason" TEXT,
    "isRider" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "batchName" TEXT NOT NULL,
    "batchDate" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerBatchItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stickerBatchId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "manufactureDate" TIMESTAMP(3) NOT NULL,
    "expireDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleFreeIssueItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productItemId" TEXT,
    "type" "SampleFreeIssueType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleFreeIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSampleFreeIssue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sampleFreeIssueItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSampleFreeIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageHoldReason" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageHoldReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierService" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRemark" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stage" "FulfillmentStage" NOT NULL,
    "type" "OrderRemarkType" NOT NULL,
    "content" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "showOnInvoice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsNotificationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "trigger" "SmsNotificationTrigger" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT NOT NULL,
    "additionalRecipients" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sendToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "sendToRider" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SmsNotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsPortalConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "authUrl" TEXT NOT NULL,
    "smsUrl" TEXT NOT NULL,
    "smsMask" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsPortalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "ContactMaster" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "lastPurchaseAt" TIMESTAMP(3),
    "recentMerchant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMaster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_createdById_key" ON "Company"("createdById");

-- CreateIndex
CREATE INDEX "FailedOrderWebhook_companyId_resolvedAt_createdAt_idx" ON "FailedOrderWebhook"("companyId", "resolvedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FailedOrderWebhook_companyId_createdAt_idx" ON "FailedOrderWebhook"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProductItem_companyId_productTitle_variantTitle_idx" ON "ProductItem"("companyId", "productTitle", "variantTitle");

-- CreateIndex
CREATE INDEX "ProductItem_companyId_companyLocationId_idx" ON "ProductItem"("companyId", "companyLocationId");

-- CreateIndex
CREATE INDEX "ProductItem_companyId_vendorId_idx" ON "ProductItem"("companyId", "vendorId");

-- CreateIndex
CREATE INDEX "ProductItem_companyId_categoryId_idx" ON "ProductItem"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductItem_companyLocationId_shopifyVariantId_key" ON "ProductItem"("companyLocationId", "shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0Id_key" ON "User"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CompanyLocation_shopifyLocationId_idx" ON "CompanyLocation"("shopifyLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_shopifyCustomerId_key" ON "Customer"("companyId", "shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_riderDeliveryToken_key" ON "Order"("riderDeliveryToken");

-- CreateIndex
CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_companyId_fulfillmentStage_createdAt_idx" ON "Order"("companyId", "fulfillmentStage", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_companyId_companyLocationId_createdAt_idx" ON "Order"("companyId", "companyLocationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_companyId_assignedMerchantId_createdAt_idx" ON "Order"("companyId", "assignedMerchantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_companyId_customerEmail_createdAt_idx" ON "Order"("companyId", "customerEmail", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_companyId_customerPhone_createdAt_idx" ON "Order"("companyId", "customerPhone", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_orderId_shopifyLineItemId_key" ON "OrderLineItem"("orderId", "shopifyLineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_code_key" ON "Supplier"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE INDEX "StickerBatch_companyId_createdAt_idx" ON "StickerBatch"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StickerBatch_companyId_batchName_key" ON "StickerBatch"("companyId", "batchName");

-- CreateIndex
CREATE INDEX "StickerBatchItem_stickerBatchId_idx" ON "StickerBatchItem"("stickerBatchId");

-- CreateIndex
CREATE INDEX "StickerBatchItem_companyId_idx" ON "StickerBatchItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSampleFreeIssue_orderId_sampleFreeIssueItemId_key" ON "OrderSampleFreeIssue"("orderId", "sampleFreeIssueItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsNotificationConfig_companyId_trigger_key" ON "SmsNotificationConfig"("companyId", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_companyId_key_key" ON "EmailTemplate"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SmsPortalConfig_companyId_key" ON "SmsPortalConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_lastPurchaseAt_idx" ON "ContactMaster"("companyId", "lastPurchaseAt");

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_updatedAt_idx" ON "ContactMaster"("companyId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_email_idx" ON "ContactMaster"("companyId", "email");

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_phoneNumber_idx" ON "ContactMaster"("companyId", "phoneNumber");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailedOrderWebhook" ADD CONSTRAINT "FailedOrderWebhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailedOrderWebhook" ADD CONSTRAINT "FailedOrderWebhook_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyWebhookSecret" ADD CONSTRAINT "ShopifyWebhookSecret_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItem" ADD CONSTRAINT "ProductItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItem" ADD CONSTRAINT "ProductItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItem" ADD CONSTRAINT "ProductItem_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItem" ADD CONSTRAINT "ProductItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_defaultMerchantUserId_fkey" FOREIGN KEY ("defaultMerchantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedMerchantId_fkey" FOREIGN KEY ("assignedMerchantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryCompleteById_fkey" FOREIGN KEY ("deliveryCompleteById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchedByCourierServiceId_fkey" FOREIGN KEY ("dispatchedByCourierServiceId") REFERENCES "CourierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchedByRiderId_fkey" FOREIGN KEY ("dispatchedByRiderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceCompleteById_fkey" FOREIGN KEY ("invoiceCompleteById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_lastPrintedById_fkey" FOREIGN KEY ("lastPrintedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageHoldReasonId_fkey" FOREIGN KEY ("packageHoldReasonId") REFERENCES "PackageHoldReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageReadyById_fkey" FOREIGN KEY ("packageReadyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sampleFreeIssueCompleteById_fkey" FOREIGN KEY ("sampleFreeIssueCompleteById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_productItemId_fkey" FOREIGN KEY ("productItemId") REFERENCES "ProductItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Designation" ADD CONSTRAINT "Designation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatchItem" ADD CONSTRAINT "StickerBatchItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatchItem" ADD CONSTRAINT "StickerBatchItem_stickerBatchId_fkey" FOREIGN KEY ("stickerBatchId") REFERENCES "StickerBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatchItem" ADD CONSTRAINT "StickerBatchItem_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleFreeIssueItem" ADD CONSTRAINT "SampleFreeIssueItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleFreeIssueItem" ADD CONSTRAINT "SampleFreeIssueItem_productItemId_fkey" FOREIGN KEY ("productItemId") REFERENCES "ProductItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSampleFreeIssue" ADD CONSTRAINT "OrderSampleFreeIssue_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSampleFreeIssue" ADD CONSTRAINT "OrderSampleFreeIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSampleFreeIssue" ADD CONSTRAINT "OrderSampleFreeIssue_sampleFreeIssueItemId_fkey" FOREIGN KEY ("sampleFreeIssueItemId") REFERENCES "SampleFreeIssueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHoldReason" ADD CONSTRAINT "PackageHoldReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierService" ADD CONSTRAINT "CourierService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRemark" ADD CONSTRAINT "OrderRemark_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRemark" ADD CONSTRAINT "OrderRemark_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsNotificationConfig" ADD CONSTRAINT "SmsNotificationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsNotificationConfig" ADD CONSTRAINT "SmsNotificationConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsPortalConfig" ADD CONSTRAINT "SmsPortalConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMaster" ADD CONSTRAINT "ContactMaster_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
