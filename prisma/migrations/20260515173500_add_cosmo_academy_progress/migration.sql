CREATE TABLE "CosmoAcademyProgress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "explanationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "lastOpenedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CosmoAcademyProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CosmoAcademyProgress_explanationId_userId_key" ON "CosmoAcademyProgress"("explanationId", "userId");
CREATE INDEX "CosmoAcademyProgress_companyId_userId_status_idx" ON "CosmoAcademyProgress"("companyId", "userId", "status");
CREATE INDEX "CosmoAcademyProgress_companyId_updatedAt_idx" ON "CosmoAcademyProgress"("companyId", "updatedAt" DESC);

ALTER TABLE "CosmoAcademyProgress" ADD CONSTRAINT "CosmoAcademyProgress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CosmoAcademyProgress" ADD CONSTRAINT "CosmoAcademyProgress_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "CosmoAcademyExplanation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CosmoAcademyProgress" ADD CONSTRAINT "CosmoAcademyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
