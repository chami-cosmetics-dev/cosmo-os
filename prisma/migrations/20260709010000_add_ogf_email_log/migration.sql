CREATE TABLE "OgfEmailLog" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "batchCode"    TEXT NOT NULL,
    "orderCount"   INTEGER NOT NULL,
    "emailTo"      TEXT NOT NULL,
    "status"       TEXT NOT NULL,
    "errorMessage" TEXT,
    "source"       TEXT NOT NULL DEFAULT 'cron',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OgfEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OgfEmailLog_companyId_createdAt_idx" ON "OgfEmailLog"("companyId", "createdAt" DESC);

ALTER TABLE "OgfEmailLog" ADD CONSTRAINT "OgfEmailLog_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
