const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const o = await prisma.order.findFirst({
    where: { name: "110-000409" },
    select: {
      name: true,
      financialStatus: true,
      totalPrice: true,
      sourceName: true,
      updatedAt: true,
      createdAt: true,
      rawPayload: true,
      paymentEntries: { select: { paymentEntryId: true, allocatedAmount: true, paymentType: true } },
    },
  });
  if (!o) {
    console.log("not found");
    return;
  }
  const p = o.rawPayload && typeof o.rawPayload === "object" ? o.rawPayload : {};
  const data = p.data && typeof p.data === "object" ? p.data : p;
  console.log(
    JSON.stringify(
      {
        os: {
          financialStatus: o.financialStatus,
          totalPrice: Number(o.totalPrice),
          sourceName: o.sourceName,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          peCount: o.paymentEntries.length,
        },
        webhook: {
          name: data.name,
          status: data.status,
          docstatus: data.docstatus,
          is_pos: data.is_pos,
          grand_total: data.grand_total,
          outstanding_amount: data.outstanding_amount,
          paid_amount: data.paid_amount,
          net_total: data.net_total,
          total: data.total,
          base_total: data.base_total,
          rounded_total: data.rounded_total,
          coupon_code: data.coupon_code,
          payments: data.payments,
          payment_schedule: data.payment_schedule,
        },
      },
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
