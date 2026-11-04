CREATE TABLE "SalesReportConfig" (
  "companyId" TEXT NOT NULL,
  "settings" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReportConfig_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "SalesReportConfig" ADD CONSTRAINT "SalesReportConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
