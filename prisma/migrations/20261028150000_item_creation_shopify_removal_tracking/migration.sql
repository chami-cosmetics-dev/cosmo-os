ALTER TABLE "ItemCreationRequest"
ADD COLUMN IF NOT EXISTS "shopifyRemovalPending" BOOLEAN NOT NULL DEFAULT false;
