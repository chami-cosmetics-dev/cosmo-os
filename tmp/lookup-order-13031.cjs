const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

async function main() {
  const byNumber = await prisma.order.findMany({
    where: {
      OR: [
        { orderNumber: { in: ["13031", "60013031"] } },
        { name: { in: ["13031", "60013031", "#13031"] } },
        { shopifyOrderId: "6650850869313" },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      shopifyOrderId: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
      sourceName: true,
      erpnextCustomerId: true,
      shippingAddress: true,
    },
  });

  const johnCardOrders = await prisma.order.findMany({
    where: {
      OR: [
        { customerPhone: { in: ["+94763520381", "94763520381", "0763520381"] } },
        { erpnextCustomerId: "0763520381" },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      orderNumber: true,
      name: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
      sourceName: true,
      erpnextCustomerId: true,
      shippingAddress: true,
    },
  });

  const secondCard = await prisma.auditLog.findMany({
    where: { entityId: "cmsk2sf1r003yj80ao4fov2hk" },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      action: true,
      summary: true,
      createdAt: true,
      afterData: true,
      metadata: true,
    },
  });

  console.log(JSON.stringify({ byNumber, johnCardOrders, secondCard }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
