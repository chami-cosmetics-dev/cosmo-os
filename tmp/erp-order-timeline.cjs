const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const first = await prisma.order.findFirst({
    where: { shopifyOrderId: { startsWith: "erp-" } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, shopifyOrderId: true, name: true },
  });
  const byMonth = await prisma.$queryRaw`
    SELECT to_char("createdAt", 'YYYY-MM') AS month, COUNT(*)::int AS count
    FROM "Order"
    WHERE "shopifyOrderId" LIKE 'erp-%'
    GROUP BY 1
    ORDER BY 1
  `;
  const erp1Instance = await prisma.erpnextInstance.findFirst({
    where: { label: { contains: "ERP_1" } },
    select: { createdAt: true, label: true },
  });
  console.log(JSON.stringify({ firstErpOrder: first, byMonth, erp1Instance }, null, 2));
}

main().finally(() => prisma.$disconnect());
