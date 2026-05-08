ALTER TABLE "User" ADD COLUMN "mreCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "User_mreCodes_idx" ON "User" USING GIN ("mreCodes");
