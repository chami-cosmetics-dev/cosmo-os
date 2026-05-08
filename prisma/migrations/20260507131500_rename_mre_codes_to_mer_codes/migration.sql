ALTER TABLE "User" RENAME COLUMN "mreCodes" TO "merCodes";

ALTER INDEX "User_mreCodes_idx" RENAME TO "User_merCodes_idx";
