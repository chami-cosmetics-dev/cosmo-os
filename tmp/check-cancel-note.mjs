import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.approvalRequest.findMany({
  where: {
    orderId: "cmwey46ht001xjs08ze44tvbs",
    type: "order_payment_approval",
  },
  select: {
    id: true,
    status: true,
    reviewNote: true,
    requestNote: true,
    updatedAt: true,
  },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
