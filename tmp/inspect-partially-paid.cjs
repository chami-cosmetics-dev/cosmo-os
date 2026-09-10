const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const names = [
    "110-000409",
    "900-000852",
    "110-000419",
    "110-000421",
    "110-000416",
    "110-000392",
    "110-000404",
    "110-000405",
  ];
  const orders = await prisma.order.findMany({
    where: { name: { in: names } },
    select: {
      name: true,
      totalPrice: true,
      financialStatus: true,
      sourceName: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
      paymentEntries: {
        select: {
          paymentEntryId: true,
          paymentType: true,
          modeOfPayment: true,
          allocatedAmount: true,
          amount: true,
          postingDate: true,
        },
        orderBy: { postingDate: "asc" },
      },
    },
  });

  for (const o of orders.sort((a, b) => a.name.localeCompare(b.name))) {
    const paid = o.paymentEntries
      .filter((p) => p.paymentType === "Receive")
      .reduce((s, p) => s + Number(p.allocatedAmount), 0);
    const refunds = o.paymentEntries
      .filter((p) => p.paymentType === "Pay")
      .reduce((s, p) => s + Math.abs(Number(p.allocatedAmount)), 0);
    console.log(
      JSON.stringify(
        {
          name: o.name,
          invoice: o.erpnextInvoiceId || o.shopifyOrderId,
          total: Number(o.totalPrice),
          status: o.financialStatus,
          source: o.sourceName,
          incomingPaid: Math.round(paid * 100) / 100,
          refunds: Math.round(refunds * 100) / 100,
          balance: Math.round((Number(o.totalPrice) - paid + refunds) * 100) / 100,
          pes: o.paymentEntries.map((p) => ({
            id: p.paymentEntryId,
            type: p.paymentType,
            mode: p.modeOfPayment,
            allocated: Number(p.allocatedAmount),
            date: p.postingDate,
          })),
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
