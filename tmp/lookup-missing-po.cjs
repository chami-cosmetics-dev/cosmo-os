const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const refs = ["60017589", "60017254", "600-002133", "600-001483"];

async function main() {
  for (const ref of refs) {
    const rows = await prisma.order.findMany({
      where: {
        OR: [
          { name: ref },
          { orderNumber: ref },
          { shopifyOrderId: ref },
          { erpnextInvoiceId: ref },
        ],
      },
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        sourceName: true,
        createdAt: true,
      },
    });
    console.log(ref, JSON.stringify(rows, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
