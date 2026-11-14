-- Revert of the R2 switch (#1185): new uploads go to Cloudinary again.
-- Kept as a forward migration so databases that already ran
-- 20261019180000_r2_file_storage_default end up with the Cloudinary default.
ALTER TABLE "ProductItemAsset" ALTER COLUMN "provider" SET DEFAULT 'cloudinary';
ALTER TABLE "File" ALTER COLUMN "provider" SET DEFAULT 'cloudinary';
