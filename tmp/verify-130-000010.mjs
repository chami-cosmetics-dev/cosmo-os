import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const order = await prisma.order.findFirst({
  where: { name: "130-000010" },
  select: {
    id: true,
    name: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    sourceName: true,
    financialStatus: true,
    fulfillmentStage: true,
    totalPrice: true,
    createdAt: true,
    companyLocation: { select: { name: true, shortName: true } },
    lineItems: {
      select: {
        quantity: true,
        price: true,
        productItem: { select: { sku: true, productTitle: true } },
      },
    },
  },
});

console.log(
  JSON.stringify(
    order
      ? {
          id: order.id,
          name: order.name,
          shopifyOrderId: order.shopifyOrderId,
          erpnextInvoiceId: order.erpnextInvoiceId,
          sourceName: order.sourceName,
          financialStatus: order.financialStatus,
          fulfillmentStage: order.fulfillmentStage,
          totalPrice: order.totalPrice?.toString?.() ?? order.totalPrice,
          createdAt: order.createdAt,
          location: order.companyLocation,
          lines: order.lineItems.map((item) => ({
            sku: item.productItem.sku,
            title: item.productItem.productTitle,
            quantity: item.quantity,
            price: item.price?.toString?.() ?? item.price,
          })),
        }
      : null,
    null,
    2,
  ),
);
await prisma.$disconnect();
