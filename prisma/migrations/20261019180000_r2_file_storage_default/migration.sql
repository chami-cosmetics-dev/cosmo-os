-- New uploads go to Cloudflare R2 (was Cloudinary). Existing rows keep their
-- provider value until scripts/migrate-files-to-r2.ts moves them.
ALTER TABLE "ProductItemAsset" ALTER COLUMN "provider" SET DEFAULT 'r2';
ALTER TABLE "File" ALTER COLUMN "provider" SET DEFAULT 'r2';
