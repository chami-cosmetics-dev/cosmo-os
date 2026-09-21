-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "ccRecipients" TEXT NOT NULL DEFAULT '';
