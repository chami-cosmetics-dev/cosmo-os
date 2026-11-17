CREATE TABLE "ReceivableEmailSendLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableEmailSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceivableEmailSendLog_companyId_templateKey_status_reportDate_idx"
ON "ReceivableEmailSendLog"("companyId", "templateKey", "status", "reportDate" DESC);

ALTER TABLE "ReceivableEmailSendLog"
ADD CONSTRAINT "ReceivableEmailSendLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
