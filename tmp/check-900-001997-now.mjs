import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const order = await prisma.order.findFirst({
  where: { name: "900-001997" },
  select: {
    id: true,
    name: true,
    fulfillmentStage: true,
    financialStatus: true,
    paymentGatewayPrimary: true,
    paymentGatewayNames: true,
    totalPrice: true,
    sampleFreeIssueCompleteAt: true,
    approvalRequests: {
      where: { type: "order_payment_approval" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        requestNote: true,
        reviewNote: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
        requestedById: true,
        paymentLines: {
          select: { paymentMethod: true, amount: true, erpPaymentEntryName: true },
        },
      },
    },
  },
});
console.log(JSON.stringify(order, null, 2));
await prisma.$disconnect();
