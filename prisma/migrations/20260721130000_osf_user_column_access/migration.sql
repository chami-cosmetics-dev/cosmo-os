-- CreateTable
CREATE TABLE "OsfUserColumnAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "columnGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsfUserColumnAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OsfUserColumnAccess_companyId_idx" ON "OsfUserColumnAccess"("companyId");

-- CreateIndex
CREATE INDEX "OsfUserColumnAccess_userId_idx" ON "OsfUserColumnAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OsfUserColumnAccess_companyId_userId_key" ON "OsfUserColumnAccess"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "OsfUserColumnAccess" ADD CONSTRAINT "OsfUserColumnAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsfUserColumnAccess" ADD CONSTRAINT "OsfUserColumnAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
