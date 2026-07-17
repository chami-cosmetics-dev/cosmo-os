-- CreateTable
CREATE TABLE "UserFinanceScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFinanceScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFinanceScope_userId_locationId_key" ON "UserFinanceScope"("userId", "locationId");

-- CreateIndex
CREATE INDEX "UserFinanceScope_companyId_locationId_idx" ON "UserFinanceScope"("companyId", "locationId");

-- AddForeignKey
ALTER TABLE "UserFinanceScope" ADD CONSTRAINT "UserFinanceScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinanceScope" ADD CONSTRAINT "UserFinanceScope_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinanceScope" ADD CONSTRAINT "UserFinanceScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
