const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Coupon-shaped false part-pay: ERP Overdue/Unpaid, Cosmo partially_paid, no PE.
 * Set those back to pending so Today/MTD count them.
 */
async function main() {
  const dry = process.argv.includes("--dry");
  const stuck = await prisma.order.findMany({
    where: {
      financialStatus: { equals: "partially_paid", mode: "insensitive" },
      paymentEntries: { none: {} },
    },
    select: {
      id: true,
      name: true,
      totalPrice: true,
      sourceName: true,
      financialStatus: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        dry,
        count: stuck.length,
        total: stuck.reduce((s, o) => s + Number(o.totalPrice), 0),
        names: stuck.map((o) => o.name),
      },
      null,
      2,
    ),
  );
  if (dry || stuck.length === 0) return;
  const result = await prisma.order.updateMany({
    where: { id: { in: stuck.map((o) => o.id) } },
    data: { financialStatus: "pending" },
  });
  console.log("updated", result.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
