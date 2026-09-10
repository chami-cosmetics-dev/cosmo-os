const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const names = [
    "110-000429",
    "110-000428",
    "110-000427",
    "60018654",
    "60018656",
    "60018660",
  ];
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { name: { in: names } },
        { orderNumber: { in: names } },
      ],
    },
    select: {
      name: true,
      orderNumber: true,
      totalPrice: true,
      financialStatus: true,
      sourceName: true,
      cancelledAt: true,
      cancelReason: true,
      createdAt: true,
      discountCodes: true,
      assignedMerchant: { select: { knownName: true, name: true, couponCodes: true } },
    },
  });
  console.log(
    JSON.stringify(
      orders.map((o) => ({
        name: o.name,
        orderNumber: o.orderNumber,
        total: Number(o.totalPrice),
        status: o.financialStatus,
        source: o.sourceName,
        cancelledAt: o.cancelledAt,
        cancelReason: o.cancelReason,
        merchant: o.assignedMerchant?.knownName || o.assignedMerchant?.name,
        coupons: o.assignedMerchant?.couponCodes,
        discountCodes: o.discountCodes,
        createdAt: o.createdAt,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
