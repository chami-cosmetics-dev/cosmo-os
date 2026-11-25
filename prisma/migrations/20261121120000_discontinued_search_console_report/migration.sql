-- CreateTable
CREATE TABLE "DiscontinuedSearchConsoleReport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagesRead" INTEGER NOT NULL,
    "productRows" INTEGER NOT NULL,
    "skippedRows" INTEGER NOT NULL,
    "handleCount" INTEGER NOT NULL,
    "filters" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "DiscontinuedSearchConsoleReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscontinuedSearchConsoleReport_uploadedAt_idx" ON "DiscontinuedSearchConsoleReport"("uploadedAt");
