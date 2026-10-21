import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const locs = await prisma.companyLocation.findMany({
  where: {
    OR: [
      { name: { contains: "USP", mode: "insensitive" } },
      { erpnextCompany: { contains: "USP", mode: "insensitive" } },
      { shortName: { contains: "USP", mode: "insensitive" } },
      { name: { contains: "KAD", mode: "insensitive" } },
      { erpnextCompany: { contains: "KAD", mode: "insensitive" } },
      { name: { contains: "Udara", mode: "insensitive" } },
      { erpnextCompany: { contains: "Udara", mode: "insensitive" } },
    ],
  },
  select: {
    id: true,
    name: true,
    shortName: true,
    erpnextCompany: true,
    erpnextWarehouse: true,
    erpnextInstanceId: true,
    erpWarehouses: { select: { warehouse: true } },
  },
  orderBy: { name: "asc" },
});

const names = [
  "130-000001",
  "130-000002",
  "130-000003",
  "130-000004",
  "130-000005",
  "130-000006",
  "130-000007",
  "130-000008",
  "130-000009",
  "130-000010",
  "900-001596",
  "500-001269",
  "140-000002",
  "140-000003",
  "140-000004",
  "140-000005",
  "140-000006",
];
const erpIds = names.map((n) => `erp-${n}`);
const orders = await prisma.order.findMany({
  where: {
    OR: [
      { shopifyOrderId: { in: erpIds } },
      { erpnextInvoiceId: { in: names } },
      { name: { in: names } },
    ],
  },
  select: {
    name: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    sourceName: true,
    fulfillmentStage: true,
    createdAt: true,
    companyLocation: { select: { name: true } },
  },
});

const locCounts = [];
for (const loc of locs) {
  const count = await prisma.order.count({ where: { companyLocationId: loc.id } });
  locCounts.push({ name: loc.name, erpnextCompany: loc.erpnextCompany, orderCount: count });
}

console.log(JSON.stringify({ locations: locs, locCounts, matchingOrders: orders }, null, 2));
await prisma.$disconnect();
