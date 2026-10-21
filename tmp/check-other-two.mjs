import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const names = ["130-000010", "500-001269", "900-001596"];
const orders = await prisma.order.findMany({
  where: {
    OR: [
      { name: { in: names } },
      { erpnextInvoiceId: { in: names } },
      { shopifyOrderId: { in: names.map((n) => `erp-${n}`) } },
    ],
  },
  select: {
    name: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    createdAt: true,
    companyLocation: { select: { shortName: true } },
  },
});

console.log(JSON.stringify(orders, null, 2));
await prisma.$disconnect();
