-- Add rating and review notes to CosmoAcademyProgress
ALTER TABLE "CosmoAcademyProgress" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "CosmoAcademyProgress" ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;
