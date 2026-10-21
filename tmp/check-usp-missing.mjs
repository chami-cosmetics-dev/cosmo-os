import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const names = ["130-000010", "500-001269", "900-001596"];
const collisions = await prisma.order.findMany({
  where: {
    OR: [
      { name: { in: names } },
      { orderNumber: { in: names } },
      { shopifyOrderId: { in: names.map((n) => `erp-${n}`) } },
      { erpnextInvoiceId: { in: names } },
    ],
  },
  select: {
    name: true,
    orderNumber: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    sourceName: true,
    financialStatus: true,
    fulfillmentStage: true,
    createdAt: true,
    companyLocation: { select: { name: true, erpnextCompany: true } },
  },
});

const usp = await prisma.companyLocation.findFirst({
  where: { shortName: "USP" },
  select: { id: true, name: true },
});

const uspOrders = usp
  ? await prisma.order.findMany({
      where: { companyLocationId: usp.id },
      select: {
        name: true,
        orderNumber: true,
        erpnextInvoiceId: true,
        financialStatus: true,
        fulfillmentStage: true,
        createdAt: true,
        totalPrice: true,
      },
      orderBy: { createdAt: "asc" },
    })
  : [];

console.log(
  JSON.stringify(
    {
      collisions,
      uspLocation: usp,
      uspOrders: uspOrders.map((o) => ({
        ...o,
        totalPrice: o.totalPrice?.toString?.() ?? o.totalPrice,
      })),
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
