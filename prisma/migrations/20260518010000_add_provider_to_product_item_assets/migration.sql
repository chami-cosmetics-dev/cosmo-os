ALTER TABLE "ProductItemAsset" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'vercel_blob';
