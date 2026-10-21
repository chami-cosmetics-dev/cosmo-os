CREATE TABLE "ErpGrnWebhook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "companyLocationId" TEXT,
    "erpnextInstanceId" TEXT,
    "documentType" TEXT NOT NULL,
    "documentName" TEXT,
    "erpCompany" TEXT,
    "endpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "rawPayload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpGrnWebhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpGrnWebhook_companyId_status_createdAt_idx"
ON "ErpGrnWebhook"("companyId", "status", "createdAt" DESC);

CREATE INDEX "ErpGrnWebhook_status_createdAt_idx"
ON "ErpGrnWebhook"("status", "createdAt" DESC);

CREATE INDEX "ErpGrnWebhook_companyId_documentType_documentName_idx"
ON "ErpGrnWebhook"("companyId", "documentType", "documentName");

ALTER TABLE "ErpGrnWebhook"
ADD CONSTRAINT "ErpGrnWebhook_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ErpGrnWebhook"
ADD CONSTRAINT "ErpGrnWebhook_companyLocationId_fkey"
FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ErpGrnWebhook"
ADD CONSTRAINT "ErpGrnWebhook_erpnextInstanceId_fkey"
FOREIGN KEY ("erpnextInstanceId") REFERENCES "ErpnextInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
