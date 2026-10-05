-- AlterTable
ALTER TABLE "ItemCreationRequest"
ADD COLUMN "creationSources" JSONB NOT NULL DEFAULT '["SHOPIFY"]';