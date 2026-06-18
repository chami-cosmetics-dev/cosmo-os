import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

const ref = process.argv[2] ?? "SV100-0159";

const order = await prisma.order.findFirst({
  where: {
    OR: [
      { name: ref },
      { erpnextInvoiceId: ref },
      { shopifyOrderId: ref },
      { shopifyOrderId: `erp-${ref}` },
    ],
  },
  select: {
    id: true,
    name: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    financialStatus: true,
    fulfillmentStage: true,
    sourceName: true,
    totalPrice: true,
    createdAt: true,
    companyLocation: { select: { name: true, erpnextCompany: true } },
  },
});

console.log(JSON.stringify(order, null, 2));
await prisma.$disconnect();
