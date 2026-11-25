import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.order.findMany({
  where: {
    OR: [
      { name: "900-001997" },
      { erpnextInvoiceId: "900-001997" },
      { shopifyOrderId: { contains: "900-001997" } },
      { name: { contains: "900-001997" } },
      { orderNumber: { contains: "001997" } },
    ],
  },
  take: 20,
  select: {
    id: true,
    name: true,
    orderNumber: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    sourceName: true,
    fulfillmentStage: true,
    financialStatus: true,
    paymentGatewayPrimary: true,
    paymentGatewayNames: true,
    totalPrice: true,
    companyId: true,
  },
});

console.log("ORDERS", JSON.stringify(rows, null, 2));

for (const order of rows.filter((row) => row.name === "900-001997" || row.erpnextInvoiceId === "900-001997")) {
  const approvals = await prisma.approvalRequest.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      type: true,
      requestNote: true,
      createdAt: true,
      updatedAt: true,
      paymentLines: {
        select: { paymentMethod: true, amount: true, erpPaymentEntryName: true },
      },
    },
  });
  console.log("MATCH", order.id, JSON.stringify(approvals, null, 2));
}

if (rows.length === 0) {
  const recentCash = await prisma.order.findMany({
    where: {
      paymentGatewayPrimary: { contains: "cash", mode: "insensitive" },
      fulfillmentStage: { in: ["order_received", "sample_free_issue"] },
      sourceName: { in: ["erpnext", "web"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      orderNumber: true,
      paymentGatewayPrimary: true,
      fulfillmentStage: true,
      totalPrice: true,
      createdAt: true,
    },
  });
  console.log("RECENT_CASH_SAMPLE", JSON.stringify(recentCash, null, 2));
}

await prisma.$disconnect();
