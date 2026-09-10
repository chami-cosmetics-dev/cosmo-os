-- AlterEnum
ALTER TYPE "SmsNotificationTrigger" ADD VALUE 'order_cancelled';

-- CreateEnum
CREATE TYPE "OrderCancelKind" AS ENUM ('customer_cancel', 'replacement');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cancelKind" "OrderCancelKind";
