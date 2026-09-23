-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "kokoLinkGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "kokoLinkTimeConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "kokoLinkTimeConfirmedById" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_kokoLinkTimeConfirmedById_fkey" FOREIGN KEY ("kokoLinkTimeConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
