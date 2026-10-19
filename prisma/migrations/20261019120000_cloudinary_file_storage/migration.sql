-- New uploads go to Cloudinary; existing Vercel Blob rows keep their provider
-- value until scripts/migrate-blob-to-cloudinary.ts moves them.
ALTER TABLE "ProductItemAsset" ALTER COLUMN "provider" SET DEFAULT 'cloudinary';
ALTER TABLE "File" ALTER COLUMN "provider" SET DEFAULT 'cloudinary';

-- Video/audio length in seconds, read from Cloudinary at upload.
ALTER TABLE "ProductItemAsset" ADD COLUMN "durationSeconds" INTEGER;
