-- AlterTable: the Search Console file's own created date (must be today to upload)
ALTER TABLE "DiscontinuedSearchConsoleReport" ADD COLUMN "fileCreatedAt" TIMESTAMP(3);
